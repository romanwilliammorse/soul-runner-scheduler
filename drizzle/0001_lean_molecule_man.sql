CREATE TABLE `scheduled_games` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`opponent` text NOT NULL,
	`starts_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `registered_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_by_team_time` ON `scheduled_games` (`team_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `team_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` text NOT NULL,
	`member_id` text NOT NULL,
	`client_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `registered_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `team_players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_by_team` ON `team_messages` (`team_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_retry_key` ON `team_messages` (`team_id`,`member_id`,`client_id`);