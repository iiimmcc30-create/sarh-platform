import { Global, Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { AdminPlansController } from './admin-plans.controller';
import { PlansService } from './plans.service';
import { PlanResolverService } from './plan-resolver.service';
import { PlanPermissionService } from './plan-permission.service';
import { PlansRepository } from './repositories/plans.repository';

@Global()
@Module({
  controllers: [PlansController, AdminPlansController],
  providers: [
    PlansService,
    PlansRepository,
    PlanResolverService,
    PlanPermissionService,
  ],
  exports: [
    PlansService,
    PlansRepository,
    PlanResolverService,
    PlanPermissionService,
  ],
})
export class PlansModule {}
