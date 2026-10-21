CREATE TABLE `ticket_activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int,
	`requestId` int,
	`actorUserId` int,
	`eventType` varchar(48) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_activity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`reviewerUserId` int NOT NULL,
	`stage` varchar(32) NOT NULL,
	`decision` varchar(40) NOT NULL,
	`note` text,
	`fileId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `designer_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotNumber` int NOT NULL,
	`label` varchar(32) NOT NULL,
	`displayName` varchar(120),
	`userId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `designer_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `designer_slots_slotNumber_unique` UNIQUE(`slotNumber`)
);
--> statement-breakpoint
CREATE TABLE `designer_job_updates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`designerSlotId` int NOT NULL,
	`designerUserId` int,
	`status` varchar(48) NOT NULL,
	`note` text,
	`eta` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `designer_job_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_operational_ids` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`josdNo` varchar(120),
	`josdAt` timestamp,
	`jodNo` varchar(120),
	`jodStatus` varchar(40),
	`dgNo` varchar(120),
	`serverPath` text,
	`uploadedAt` timestamp,
	`clipperClosedAt` timestamp,
	CONSTRAINT `ticket_operational_ids_id` PRIMARY KEY(`id`),
	CONSTRAINT `ticket_operational_ids_ticketId_unique` UNIQUE(`ticketId`)
);
--> statement-breakpoint
CREATE TABLE `qc_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`checkerUserId` int NOT NULL,
	`stage` varchar(16) NOT NULL,
	`result` enum('lolos','revisi') NOT NULL,
	`items` json NOT NULL,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qc_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `design_request_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`contentType` varchar(120) NOT NULL,
	`fileSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_request_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `design_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestNo` varchar(32) NOT NULL,
	`source` enum('marketing','owner','other') NOT NULL,
	`requesterName` varchar(160) NOT NULL,
	`requesterUserId` int,
	`contact` varchar(120),
	`productType` varchar(100) NOT NULL,
	`sizeSpec` varchar(120),
	`seriesCount` int NOT NULL DEFAULT 1,
	`theme` text,
	`sourceReason` varchar(120),
	`competitorReference` text,
	`productionEstimate` varchar(160),
	`targetArea` varchar(160),
	`businessJustification` text,
	`similarDesign` varchar(32),
	`similarDesignRef` varchar(160),
	`designReuse` enum('reuse','recolor','new'),
	`requestedPriority` enum('normal','urgent') NOT NULL DEFAULT 'normal',
	`finalPriority` enum('normal','urgent'),
	`urgentReason` text,
	`deadline` date,
	`referenceLink` text,
	`notes` text,
	`status` varchar(40) NOT NULL DEFAULT 'baru_masuk',
	`reviewDecision` varchar(40),
	`reviewReason` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_requests_requestNo_unique` UNIQUE(`requestNo`)
);
--> statement-breakpoint
CREATE TABLE `ticket_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`fileType` varchar(32) NOT NULL,
	`contentType` varchar(120) NOT NULL,
	`fileSize` int NOT NULL,
	`versionNo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `design_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketNo` varchar(32) NOT NULL,
	`requestId` int NOT NULL,
	`spvUserId` int NOT NULL,
	`designerSlotId` int NOT NULL,
	`brief` text NOT NULL,
	`processStatus` varchar(40) NOT NULL DEFAULT 'draft',
	`processUpdatedAt` timestamp NOT NULL DEFAULT (now()),
	`jobStatus` varchar(48) NOT NULL DEFAULT 'Belum mulai',
	`jobNote` text,
	`eta` date,
	`deadline` date,
	`startedAt` timestamp,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_tickets_ticketNo_unique` UNIQUE(`ticketNo`),
	CONSTRAINT `design_tickets_requestId_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `workflow_sla_rules` (
	`processStatus` varchar(40) NOT NULL,
	`maxHours` int NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_sla_rules_processStatus` PRIMARY KEY(`processStatus`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `appRole` enum('unassigned','marketing','owner','manager','spv','designer','mpp','admin','superadmin','qc1','qc2') DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE `ticket_activity_events` ADD CONSTRAINT `ticket_activity_events_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_activity_events` ADD CONSTRAINT `ticket_activity_events_requestId_design_requests_id_fk` FOREIGN KEY (`requestId`) REFERENCES `design_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_activity_events` ADD CONSTRAINT `ticket_activity_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_approvals` ADD CONSTRAINT `ticket_approvals_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_approvals` ADD CONSTRAINT `ticket_approvals_reviewerUserId_users_id_fk` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `designer_slots` ADD CONSTRAINT `designer_slots_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `designer_job_updates` ADD CONSTRAINT `designer_job_updates_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `designer_job_updates` ADD CONSTRAINT `designer_job_updates_designerSlotId_designer_slots_id_fk` FOREIGN KEY (`designerSlotId`) REFERENCES `designer_slots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `designer_job_updates` ADD CONSTRAINT `designer_job_updates_designerUserId_users_id_fk` FOREIGN KEY (`designerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_operational_ids` ADD CONSTRAINT `ticket_operational_ids_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_reviews` ADD CONSTRAINT `qc_reviews_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qc_reviews` ADD CONSTRAINT `qc_reviews_checkerUserId_users_id_fk` FOREIGN KEY (`checkerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_request_files` ADD CONSTRAINT `design_request_files_requestId_design_requests_id_fk` FOREIGN KEY (`requestId`) REFERENCES `design_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_request_files` ADD CONSTRAINT `design_request_files_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_requests` ADD CONSTRAINT `design_requests_requesterUserId_users_id_fk` FOREIGN KEY (`requesterUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_requests` ADD CONSTRAINT `design_requests_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_files` ADD CONSTRAINT `ticket_files_ticketId_design_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `design_tickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ticket_files` ADD CONSTRAINT `ticket_files_uploadedBy_users_id_fk` FOREIGN KEY (`uploadedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_tickets` ADD CONSTRAINT `design_tickets_requestId_design_requests_id_fk` FOREIGN KEY (`requestId`) REFERENCES `design_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_tickets` ADD CONSTRAINT `design_tickets_spvUserId_users_id_fk` FOREIGN KEY (`spvUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `design_tickets` ADD CONSTRAINT `design_tickets_designerSlotId_designer_slots_id_fk` FOREIGN KEY (`designerSlotId`) REFERENCES `designer_slots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_sla_rules` ADD CONSTRAINT `workflow_sla_rules_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;