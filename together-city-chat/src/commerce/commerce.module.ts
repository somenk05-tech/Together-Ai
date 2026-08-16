import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinancialModule } from '../financial/financial.module';
import { CommerceController } from './commerce.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { SettlementService } from './settlement.service';
import { SandboxPaymentProvider, SandboxPayoutProvider } from './sandbox.provider';
import { PAYMENT_PROVIDER, PAYOUT_PROVIDER } from './provider';

/**
 * THE TILL, WIRED.
 *
 * The two provider bindings below are the whole of what changes when a real
 * payment company is signed: swap `SandboxPaymentProvider` for a Razorpay or
 * Stripe adapter implementing the same interface, and nothing else in this
 * module — or in any screen — is touched. That is the point of them being
 * tokens rather than imports.
 *
 * `FinancialModule` is imported rather than reimplemented, because the city has
 * exactly one wallet and one conditional-decrement charge, and a second one
 * written here would be a second answer to "how much has this citizen got".
 */
@Module({
  imports: [PrismaModule, NotificationsModule, FinancialModule],
  controllers: [CommerceController],
  providers: [
    InvoicesService,
    PaymentsService,
    SettlementService,
    { provide: PAYMENT_PROVIDER, useClass: SandboxPaymentProvider },
    { provide: PAYOUT_PROVIDER, useClass: SandboxPayoutProvider },
  ],
  exports: [InvoicesService],
})
export class CommerceModule {}
