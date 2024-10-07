import { convertParams } from 'chanfana';
import { z } from 'zod';

// FileBody
interface ParameterType {
	default?: string | number | boolean;
	description?: string;
	example?: string | number | boolean;
	required?: boolean;
	deprecated?: boolean;
}
interface StringParameterType extends ParameterType {
	format?: string;
}
export function FileBody(params?: StringParameterType): z.ZodString {
	return convertParams<z.ZodString>(z.string(), params);
}

export type Bindings = Env;
