-- Generated from Better Auth 1.7.11 with two-factor plugin; reviewed for MySQL.
alter table `user` add column `twoFactorEnabled` boolean default false;

create table `twoFactor` (`id` varchar(36) collate utf8mb4_bin not null primary key, `secret` varchar(255) not null, `backupCodes` text not null, `userId` varchar(36) collate utf8mb4_bin not null references `user` (`id`) on delete cascade, `verified` boolean, `failedVerificationCount` integer, `lockedUntil` timestamp(3));

create index `twoFactor_secret_idx` on `twoFactor` (`secret`);

create index `twoFactor_userId_idx` on `twoFactor` (`userId`);

ALTER TABLE twoFactor ADD CONSTRAINT two_factor_user_fk FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE;
