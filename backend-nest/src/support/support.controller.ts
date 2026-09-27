import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { SupportTicketsService } from './services/support-tickets.service';
import { AccountVerificationService } from './services/account-verification.service';
import { FaqService } from './services/faq.service';
import {
  CreateSupportTicketDto,
  ReplySupportTicketDto,
  UpsertVerificationDto,
  VerificationDocumentDto,
} from './dto/support.dto';

@Controller('support')
export class SupportController {
  constructor(
    private readonly tickets: SupportTicketsService,
    private readonly verification: AccountVerificationService,
    private readonly faq: FaqService,
  ) {}

  @Public()
  @RateLimit('api')
  @Get('meta')
  @HttpCode(HttpStatus.OK)
  meta() {
    return successResponse({
      tickets: this.tickets.getMeta(),
      verification: this.verification.getMeta(),
      faq: this.faq.getMeta(),
    });
  }

  @Public()
  @RateLimit('api')
  @Get('faqs')
  @HttpCode(HttpStatus.OK)
  async listFaqs(@Query() query: Record<string, unknown>) {
    return successResponse(await this.faq.listPublic(query));
  }

  @RateLimit('api')
  @Get('tickets')
  @HttpCode(HttpStatus.OK)
  async listTickets(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return successResponse(await this.tickets.listUserTickets(user, query));
  }

  @RateLimit('api')
  @Get('tickets/:id')
  @HttpCode(HttpStatus.OK)
  async getTicket(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.tickets.getUserTicket(user, id));
  }

  @RateLimit('api')
  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  async createTicket(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateSupportTicketDto,
  ) {
    return successResponse(await this.tickets.createTicket(user, body));
  }

  @RateLimit('api')
  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.OK)
  async replyTicket(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: ReplySupportTicketDto,
  ) {
    return successResponse(await this.tickets.replyAsUser(user, id, body));
  }

  @RateLimit('api')
  @Get('verification')
  @HttpCode(HttpStatus.OK)
  async getVerification(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.verification.getUserRequest(user));
  }

  @RateLimit('api')
  @Patch('verification')
  @HttpCode(HttpStatus.OK)
  async upsertVerification(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpsertVerificationDto,
  ) {
    return successResponse(await this.verification.upsertDraft(user, body));
  }

  @RateLimit('api')
  @Post('verification/documents')
  @HttpCode(HttpStatus.CREATED)
  async addVerificationDocument(
    @CurrentUser() user: JwtPayload,
    @Body() body: VerificationDocumentDto,
  ) {
    return successResponse(await this.verification.addDocument(user, body));
  }

  @RateLimit('api')
  @Delete('verification/documents/:documentId')
  @HttpCode(HttpStatus.OK)
  async removeVerificationDocument(
    @CurrentUser() user: JwtPayload,
    @Param('documentId') documentId: string,
  ) {
    return successResponse(
      await this.verification.removeDocument(user, documentId),
    );
  }

  @RateLimit('api')
  @Post('verification/submit')
  @HttpCode(HttpStatus.OK)
  async submitVerification(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.verification.submit(user));
  }
}
