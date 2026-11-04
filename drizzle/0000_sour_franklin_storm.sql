CREATE TABLE `access_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_players` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`discord` text NOT NULL,
	`is_owner` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`pin_hash` text,
	`timezone` text,
	`slots` text,
	`saved_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `registered_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_player_name` ON `team_players` (`team_id`,`name_key`) WHERE active = 1;--> statement-breakpoint
CREATE INDEX `players_by_team` ON `team_players` (`team_id`);--> statement-breakpoint
CREATE TABLE `access_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`team_id` text,
	`member_id` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_team` ON `access_sessions` (`team_id`);--> statement-breakpoint
CREATE INDEX `session_member` ON `access_sessions` (`member_id`);--> statement-breakpoint
CREATE TABLE `league_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `registered_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`division` text NOT NULL,
	`owner_hash` text NOT NULL,
	`team_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_name_division` ON `registered_teams` (`name_key`,`division`);