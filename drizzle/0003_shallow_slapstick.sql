ALTER TABLE `local_auth_credentials` ADD `failedAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `local_auth_credentials` ADD `lockedUntil` timestamp;