import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import type { z } from "zod";

type ZodDto = { schema?: z.ZodType };

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as ZodDto | undefined)?.schema;
    if (!schema || metadata.type !== "body") return value;
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "The request body is invalid",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
