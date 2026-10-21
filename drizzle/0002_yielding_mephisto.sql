CREATE TABLE `local_auth_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_auth_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_auth_credentials_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `local_auth_credentials_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `local_auth_credentials` ADD CONSTRAINT `local_auth_credentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;