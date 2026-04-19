import { Model, ModelSchema, AnimationConfig, AnimationConfigSchema } from './schema';

export class ValidationError extends Error {
  constructor(
    public readonly errors: Array<{ path: string; message: string }>,
    message: string = 'Validation failed'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateModel(data: unknown): Model {
  try {
    return ModelSchema.parse(data);
  } catch (error: any) {
    const validationErrors = error.errors?.map((e: any) => ({
      path: e.path.join('.'),
      message: e.message,
    })) || [];
    throw new ValidationError(validationErrors, 'Model validation failed');
  }
}

export function validateAnimationConfig(data: unknown): AnimationConfig {
  try {
    return AnimationConfigSchema.parse(data);
  } catch (error: any) {
    const validationErrors = error.errors?.map((e: any) => ({
      path: e.path.join('.'),
      message: e.message,
    })) || [];
    throw new ValidationError(validationErrors, 'Animation config validation failed');
  }
}

export function validateModelStrict(data: unknown): { valid: true; data: Model } | { valid: false; errors: Array<{ path: string; message: string }> } {
  try {
    return { valid: true, data: ModelSchema.parse(data) };
  } catch (error: any) {
    const validationErrors = error.errors?.map((e: any) => ({
      path: e.path.join('.'),
      message: e.message,
    })) || [];
    return { valid: false, errors: validationErrors };
  }
}
