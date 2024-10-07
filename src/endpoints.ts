import { legacyTypeIntoZod, OpenAPIRoute } from "chanfana";
import { Context } from "hono";
import { z } from "zod";

import * as photon from "./photon/photon_rs";
import encodeWebp, { init as initWebpWasm } from "@jsquash/webp/encode";

//@ts-ignore
import PHOTON_WASM from "./photon/photon_rs_bg.wasm";
//@ts-ignore
import WEBP_ENC_WASM from "../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm";

import { Bindings, FileBody } from "./types";

// 图片处理
const photonInstance = await WebAssembly.instantiate(PHOTON_WASM, {
  "./photon_rs_bg.js": photon as any,
});
photon.setWasm(photonInstance.exports); // need patch

await initWebpWasm(WEBP_ENC_WASM);

const OUTPUT_FORMATS = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const multipleImageMode = ["watermark", "blend"];

const inWhiteList = (env: Bindings, url: string) => {
  const imageUrl = new URL(url);
  const whiteList = env.WHITE_LIST ? env.WHITE_LIST.split(",") : [];
  return !(
    whiteList.length &&
    !whiteList.find((hostname) => imageUrl.hostname.endsWith(hostname))
  );
};

const processImage = async (
  env: Bindings,
  headers: Record<string, string>,
  inputImage: any,
  pipeAction: string
) => {
  const [action, options = ""] = pipeAction.split("!");
  const params = options.split(",");
  if (multipleImageMode.includes(action)) {
    const image2 = params.shift(); // 是否需要 decodeURIComponent ?
    if (image2 && inWhiteList(env, image2)) {
      const image2Res = await fetch(image2, { headers });
      if (image2Res.ok) {
        const inputImage2 = photon.PhotonImage.new_from_byteslice(
          new Uint8Array(await image2Res.arrayBuffer())
        );
        // 多图处理是处理原图
        (photon as any)[action](inputImage, inputImage2, ...params);
        return inputImage; // 多图模式返回第一张图
      }
    }
  } else {
    return (photon as any)[action](inputImage, ...params);
  }
};

export class PhotonTransform extends OpenAPIRoute {
  schema = {
    summary: "photon transform",
    description:
      "<h2>photon</h2> <br /> https://github.com/silvia-odwyer/photon <br /> action 示例：`resize!20,20,5|grayscale`",
    request: {
      query: z.object({
        url: z
          .string()
          .url()
          .default("https://avatars.githubusercontent.com/u/314135"),
        format: z.enum(["jpeg", "jpg", "png", "webp"]).default("webp"),
        action: z.string().optional(),
        quality: z.number().optional(),
      }),
    },
    response: {
      200: {
        description: "图片内容",
        content: {
          "image/*": {
            schema: legacyTypeIntoZod({ file: FileBody({ format: "binary" }) }),
          },
        },
      },
    },
  };

  async handle(c: Context<{ Bindings: Bindings }>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { url, format, action, quality } = data.query;
    if (!url) {
      return c.json({ error: "url is required" }, 400);
    }

    if (!inWhiteList(c.env, url)) {
      return c.json({ error: "url is not in white list" }, 403);
    }

    const imageRes = await fetch(url, { headers: c.req.header() });
    if (!imageRes.ok) {
      return imageRes;
    }

    const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
    try {
      const inputImage = photon.PhotonImage.new_from_byteslice(imageBytes);
      console.log("create inputImage done");

      /** pipe
       * `resize!800,400,1|grayscale`
       */
      const pipe = action?.split("|") || [];
      const outputImage = await pipe
        .filter(Boolean)
        .reduce(async (result: any, pipeAction: string) => {
          result = await result;
          return (
            (await processImage(c.env, c.req.header(), result, pipeAction)) ||
            result
          );
        }, inputImage);
      console.log("create outputImage done");

      // 图片编码
      let outputImageData;
      if (format === "jpeg" || format === "jpg") {
        outputImageData = outputImage.get_bytes_jpeg(quality);
      } else if (format === "png") {
        outputImageData = outputImage.get_bytes();
      } else {
        outputImageData = await encodeWebp(outputImage.get_image_data(), {
          quality,
        });
      }
      console.log("create outputImageData done");

      // 释放资源
      inputImage.ptr && inputImage.free();
      outputImage.ptr && outputImage.free();
      console.log("image free done");

      c.header("content-type", OUTPUT_FORMATS[format]);
      return c.body(outputImageData);
    } catch (error: any) {
      console.error("process:error", error.name, error.message, error);
      return c.json({ error: error.message }, 400);
    }
  }
}
