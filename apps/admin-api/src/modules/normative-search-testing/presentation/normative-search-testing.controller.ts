import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { normativeSearchRequestSchema } from "@qhse/contracts";

import { NormativeSearchTester } from "../application/normative-search-testing.port.js";

@ApiTags("normative-search-testing")
@ApiCookieAuth()
@Controller("v1/normative-search-testing")
export class NormativeSearchTestingController {
  constructor(@Inject(NormativeSearchTester) private readonly tester: NormativeSearchTester) {}

  @Post("search")
  @ApiOkResponse({ description: "Full retrieved chunk content, for inspecting what the AI sees" })
  search(@Body() body: unknown) {
    const parsed = normativeSearchRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.tester.search(parsed.data);
  }
}
