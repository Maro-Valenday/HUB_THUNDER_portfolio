IF OBJECT_ID(N'[dbo].[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [dbo].[__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [ModTypes] (
        [Id] int NOT NULL IDENTITY,
        [Kind] int NOT NULL,
        [Name] nvarchar(32) NOT NULL,
        [Slug] nvarchar(32) NOT NULL,
        CONSTRAINT [PK_ModTypes] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [Tags] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(48) NOT NULL,
        [Slug] nvarchar(48) NOT NULL,
        CONSTRAINT [PK_Tags] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] int NOT NULL IDENTITY,
        [DiscordUserId] nvarchar(64) NOT NULL,
        [Username] nvarchar(64) NOT NULL,
        [DisplayName] nvarchar(96) NOT NULL,
        [AvatarUrl] nvarchar(512) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [LastLoginAt] datetime2 NULL,
        [IsActive] bit NOT NULL,
        [IsAdmin] bit NOT NULL,
        [IsModerator] bit NOT NULL,
        [IsContentCreator] bit NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [DiscordAccounts] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [DiscordUserId] nvarchar(64) NOT NULL,
        [Username] nvarchar(64) NOT NULL,
        [GlobalName] nvarchar(96) NULL,
        [AvatarHash] nvarchar(128) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_DiscordAccounts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_DiscordAccounts_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [Mods] (
        [Id] int NOT NULL IDENTITY,
        [Title] nvarchar(160) NOT NULL,
        [Slug] nvarchar(180) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [AuthorId] int NOT NULL,
        [ModTypeId] int NOT NULL,
        [ContentRating] int NOT NULL,
        [IsPremium] bit NOT NULL,
        [IsPublished] bit NOT NULL,
        [IsFeatured] bit NOT NULL,
        [IsApproved] bit NOT NULL,
        [DownloadsCount] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Mods] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Mods_ModTypes_ModTypeId] FOREIGN KEY ([ModTypeId]) REFERENCES [ModTypes] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_Mods_Users_AuthorId] FOREIGN KEY ([AuthorId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [ModFiles] (
        [Id] int NOT NULL IDENTITY,
        [ModId] int NOT NULL,
        [FileName] nvarchar(255) NOT NULL,
        [StorageType] nvarchar(32) NOT NULL,
        [StorageKey] nvarchar(512) NULL,
        [ExternalUrl] nvarchar(2048) NULL,
        [FileSize] bigint NULL,
        [DownloadCount] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_ModFiles] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ModFiles_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [Mods] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [ModImages] (
        [Id] int NOT NULL IDENTITY,
        [ModId] int NOT NULL,
        [Url] nvarchar(1024) NOT NULL,
        [FileName] nvarchar(255) NOT NULL,
        [ImageType] int NOT NULL,
        [SortOrder] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_ModImages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ModImages_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [Mods] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [ModTags] (
        [ModId] int NOT NULL,
        [TagId] int NOT NULL,
        CONSTRAINT [PK_ModTags] PRIMARY KEY ([ModId], [TagId]),
        CONSTRAINT [FK_ModTags_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [Mods] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ModTags_Tags_TagId] FOREIGN KEY ([TagId]) REFERENCES [Tags] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE TABLE [Downloads] (
        [Id] bigint NOT NULL IDENTITY,
        [ModId] int NOT NULL,
        [ModFileId] int NOT NULL,
        [UserId] int NULL,
        [IpHash] nvarchar(128) NULL,
        [DownloadedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Downloads] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Downloads_ModFiles_ModFileId] FOREIGN KEY ([ModFileId]) REFERENCES [ModFiles] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Downloads_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [Mods] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DiscordAccounts_DiscordUserId] ON [DiscordAccounts] ([DiscordUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_DiscordAccounts_UserId] ON [DiscordAccounts] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Downloads_ModFileId] ON [Downloads] ([ModFileId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Downloads_ModId_DownloadedAt] ON [Downloads] ([ModId], [DownloadedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ModFiles_ModId] ON [ModFiles] ([ModId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ModImages_ModId] ON [ModImages] ([ModId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Mods_AuthorId] ON [Mods] ([AuthorId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Mods_ModTypeId] ON [Mods] ([ModTypeId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Mods_Slug] ON [Mods] ([Slug]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_ModTags_TagId] ON [ModTags] ([TagId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ModTypes_Slug] ON [ModTypes] ([Slug]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Tags_Slug] ON [Tags] ([Slug]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_DiscordUserId] ON [Users] ([DiscordUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260828205107_InitialCreate'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260828205107_InitialCreate', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830125827_AddContentAccessAndDiscordState'
)
BEGIN
    ALTER TABLE [Users] ADD [LastUploadPromptAt] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830125827_AddContentAccessAndDiscordState'
)
BEGIN
    ALTER TABLE [Mods] ADD [IsNsfw] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830125827_AddContentAccessAndDiscordState'
)
BEGIN
    ALTER TABLE [DiscordAccounts] ADD [HasPremiumRole] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830125827_AddContentAccessAndDiscordState'
)
BEGIN
    ALTER TABLE [DiscordAccounts] ADD [IsGuildMember] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830125827_AddContentAccessAndDiscordState'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260830125827_AddContentAccessAndDiscordState', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830195442_AddDiscordModImports'
)
BEGIN
    ALTER TABLE [ModImages] ADD [StorageKey] nvarchar(512) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830195442_AddDiscordModImports'
)
BEGIN
    CREATE TABLE [DiscordModImports] (
        [Id] int NOT NULL IDENTITY,
        [ModId] int NOT NULL,
        [GuildId] nvarchar(32) NOT NULL,
        [ChannelId] nvarchar(32) NOT NULL,
        [MessageId] nvarchar(32) NOT NULL,
        [AuthorDiscordUserId] nvarchar(64) NOT NULL,
        [Status] int NOT NULL,
        [ImportedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NOT NULL,
        [LastError] nvarchar(2000) NULL,
        CONSTRAINT [PK_DiscordModImports] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_DiscordModImports_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [Mods] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830195442_AddDiscordModImports'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DiscordModImports_GuildId_ChannelId_MessageId] ON [DiscordModImports] ([GuildId], [ChannelId], [MessageId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830195442_AddDiscordModImports'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DiscordModImports_ModId] ON [DiscordModImports] ([ModId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260830195442_AddDiscordModImports'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260830195442_AddDiscordModImports', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831043000_AddModRejectionStatus'
)
BEGIN
    ALTER TABLE [Mods] ADD [IsRejected] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831043000_AddModRejectionStatus'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260831043000_AddModRejectionStatus', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831082121_AddGeneratorUsage'
)
BEGIN
    CREATE TABLE [GeneratorUsages] (
        [Id] bigint NOT NULL IDENTITY,
        [UserId] int NULL,
        [AnonymousKey] nvarchar(128) NULL,
        [UsageDate] date NOT NULL,
        [GenerationCount] int NOT NULL,
        [LastGeneratedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_GeneratorUsages] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831082121_AddGeneratorUsage'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_GeneratorUsages_AnonymousKey_UsageDate] ON [GeneratorUsages] ([AnonymousKey], [UsageDate]) WHERE [AnonymousKey] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831082121_AddGeneratorUsage'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_GeneratorUsages_UserId_UsageDate] ON [GeneratorUsages] ([UserId], [UsageDate]) WHERE [UserId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831082121_AddGeneratorUsage'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260831082121_AddGeneratorUsage', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831085529_AddGeneratorUsageReservations'
)
BEGIN
    ALTER TABLE [GeneratorUsages] ADD [PendingCount] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260831085529_AddGeneratorUsageReservations'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260831085529_AddGeneratorUsageReservations', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260902191812_AddDiscordIntegrationOperations'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [DiscordStateObservedAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260902191812_AddDiscordIntegrationOperations'
)
BEGIN
    CREATE TABLE [dbo].[DiscordIntegrationOperations] (
        [Id] bigint NOT NULL IDENTITY,
        [EventId] nvarchar(128) NOT NULL,
        [OperationType] nvarchar(64) NOT NULL,
        [GuildId] nvarchar(64) NOT NULL,
        [SubjectId] nvarchar(64) NOT NULL,
        [AppliedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_DiscordIntegrationOperations] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260902191812_AddDiscordIntegrationOperations'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DiscordIntegrationOperations_EventId] ON [dbo].[DiscordIntegrationOperations] ([EventId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260902191812_AddDiscordIntegrationOperations'
)
BEGIN
    CREATE INDEX [IX_DiscordIntegrationOperations_OperationType_GuildId_SubjectId] ON [dbo].[DiscordIntegrationOperations] ([OperationType], [GuildId], [SubjectId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260902191812_AddDiscordIntegrationOperations'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260902191812_AddDiscordIntegrationOperations', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260904035926_AddModPublicationUsage'
)
BEGIN
    CREATE TABLE [dbo].[ModPublicationUsages] (
        [Id] bigint NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [UsageDate] date NOT NULL,
        [PublicationCount] int NOT NULL,
        [PendingCount] int NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_ModPublicationUsages] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260904035926_AddModPublicationUsage'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ModPublicationUsages_UserId_UsageDate] ON [dbo].[ModPublicationUsages] ([UserId], [UsageDate]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260904035926_AddModPublicationUsage'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260904035926_AddModPublicationUsage', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumExpiresAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleLastError] nvarchar(96) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleManaged] bit NOT NULL DEFAULT CAST(0 AS bit);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleNextAttemptAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleSyncAttempts] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleSyncStatus] nvarchar(32) NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    ALTER TABLE [dbo].[DiscordAccounts] ADD [PremiumRoleSyncedAtUtc] datetime2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    CREATE TABLE [dbo].[PremiumPayments] (
        [Id] nvarchar(40) NOT NULL,
        [UserId] int NOT NULL,
        [DiscordAccountId] int NOT NULL,
        [DiscordUserId] nvarchar(64) NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [OpenUserId] int NULL,
        [InvoiceId] nvarchar(64) NULL,
        [PaymentId] nvarchar(64) NULL,
        [InvoiceUrl] nvarchar(2048) NULL,
        [Description] nvarchar(160) NOT NULL,
        [PriceAmount] decimal(18,2) NOT NULL,
        [PriceCurrency] nvarchar(16) NOT NULL,
        [PayCurrency] nvarchar(32) NULL,
        [PayAmount] decimal(38,18) NULL,
        [ActuallyPaid] decimal(38,18) NULL,
        [Status] nvarchar(32) NOT NULL,
        [ProviderStatus] nvarchar(32) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [LastIpnAtUtc] datetime2 NULL,
        [CompletedAtUtc] datetime2 NULL,
        [PremiumExpiresAtUtc] datetime2 NULL,
        [IpnCount] int NOT NULL,
        [LastIpnSha256] nvarchar(64) NULL,
        [LastError] nvarchar(96) NULL,
        CONSTRAINT [PK_PremiumPayments] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_PremiumPayments_DiscordAccounts_DiscordAccountId] FOREIGN KEY ([DiscordAccountId]) REFERENCES [dbo].[DiscordAccounts] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PremiumPayments_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    CREATE INDEX [IX_DiscordAccounts_PremiumRoleNextAttemptAtUtc] ON [dbo].[DiscordAccounts] ([PremiumRoleNextAttemptAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    CREATE INDEX [IX_PremiumPayments_DiscordAccountId] ON [dbo].[PremiumPayments] ([DiscordAccountId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PremiumPayments_InvoiceId] ON [dbo].[PremiumPayments] ([InvoiceId]) WHERE [InvoiceId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PremiumPayments_OpenUserId] ON [dbo].[PremiumPayments] ([OpenUserId]) WHERE [OpenUserId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_PremiumPayments_PaymentId] ON [dbo].[PremiumPayments] ([PaymentId]) WHERE [PaymentId] IS NOT NULL');
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    CREATE UNIQUE INDEX [IX_PremiumPayments_UserId_RequestId] ON [dbo].[PremiumPayments] ([UserId], [RequestId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914123616_AddPremiumPayments'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260914123616_AddPremiumPayments', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914133122_AddModViews'
)
BEGIN
    ALTER TABLE [dbo].[Mods] ADD [ViewsCount] bigint NOT NULL DEFAULT CAST(0 AS bigint);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914133122_AddModViews'
)
BEGIN
    CREATE TABLE [dbo].[ModViewVisits] (
        [ModId] int NOT NULL,
        [VisitorKey] nvarchar(66) NOT NULL,
        [LastViewedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_ModViewVisits] PRIMARY KEY ([ModId], [VisitorKey]),
        CONSTRAINT [FK_ModViewVisits_Mods_ModId] FOREIGN KEY ([ModId]) REFERENCES [dbo].[Mods] ([Id]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914133122_AddModViews'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260914133122_AddModViews', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914170714_AddIndexNowNotifications'
)
BEGIN
    CREATE TABLE [dbo].[IndexNowNotifications] (
        [Id] uniqueidentifier NOT NULL,
        [Path] nvarchar(2048) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [NextAttemptAtUtc] datetime2 NOT NULL,
        [Attempts] int NOT NULL,
        [LastHttpStatus] int NULL,
        CONSTRAINT [PK_IndexNowNotifications] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914170714_AddIndexNowNotifications'
)
BEGIN
    CREATE INDEX [IX_IndexNowNotifications_NextAttemptAtUtc] ON [dbo].[IndexNowNotifications] ([NextAttemptAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260914170714_AddIndexNowNotifications'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260914170714_AddIndexNowNotifications', N'8.0.30');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE TABLE [dbo].[BlkOptimizationUsages] (
        [Id] uniqueidentifier NOT NULL,
        [SubjectKey] nvarchar(80) NOT NULL,
        [UserId] int NULL,
        [UsageDate] date NOT NULL,
        [Status] nvarchar(16) NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [CompletedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_BlkOptimizationUsages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_BlkOptimizationUsages_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE TABLE [dbo].[ProviderEntitlements] (
        [Id] bigint NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [Provider] nvarchar(32) NOT NULL,
        [SourceKey] nvarchar(128) NOT NULL,
        [Entitlement] nvarchar(32) NOT NULL,
        [StartsAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [RevokedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_ProviderEntitlements] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ProviderEntitlements_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE TABLE [dbo].[ProviderIdentities] (
        [Id] bigint NOT NULL IDENTITY,
        [Provider] nvarchar(32) NOT NULL,
        [ProviderUserId] nvarchar(128) NOT NULL,
        [HubThunderUserId] int NOT NULL,
        CONSTRAINT [PK_ProviderIdentities] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ProviderIdentities_Users_HubThunderUserId] FOREIGN KEY ([HubThunderUserId]) REFERENCES [dbo].[Users] ([Id]) ON DELETE NO ACTION
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE TABLE [dbo].[ProviderProducts] (
        [Id] bigint NOT NULL IDENTITY,
        [Provider] nvarchar(32) NOT NULL,
        [ResourceType] nvarchar(32) NOT NULL,
        [ProductId] nvarchar(128) NOT NULL,
        [Entitlement] nvarchar(32) NOT NULL,
        [Enabled] bit NOT NULL,
        CONSTRAINT [PK_ProviderProducts] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE TABLE [dbo].[ProviderWebhookEvents] (
        [Id] bigint NOT NULL IDENTITY,
        [Provider] nvarchar(32) NOT NULL,
        [EventKey] nvarchar(64) NOT NULL,
        [EventName] nvarchar(80) NOT NULL,
        [ReceivedAtUtc] datetime2 NOT NULL,
        [ProcessedAtUtc] datetime2 NULL,
        [Status] nvarchar(32) NOT NULL,
        [PayloadHash] nvarchar(64) NOT NULL,
        [ProviderUserId] nvarchar(128) NULL,
        [ProductId] nvarchar(128) NULL,
        [EventCreatedAtUtc] datetime2 NULL,
        [ExpiresAtUtc] datetime2 NULL,
        [Error] nvarchar(256) NULL,
        CONSTRAINT [PK_ProviderWebhookEvents] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE INDEX [IX_BlkOptimizationUsages_SubjectKey_UsageDate_Status] ON [dbo].[BlkOptimizationUsages] ([SubjectKey], [UsageDate], [Status]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE INDEX [IX_BlkOptimizationUsages_UserId] ON [dbo].[BlkOptimizationUsages] ([UserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ProviderEntitlements_Provider_SourceKey_Entitlement] ON [dbo].[ProviderEntitlements] ([Provider], [SourceKey], [Entitlement]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE INDEX [IX_ProviderEntitlements_UserId_Entitlement_ExpiresAtUtc] ON [dbo].[ProviderEntitlements] ([UserId], [Entitlement], [ExpiresAtUtc]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE INDEX [IX_ProviderIdentities_HubThunderUserId] ON [dbo].[ProviderIdentities] ([HubThunderUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ProviderIdentities_Provider_ProviderUserId] ON [dbo].[ProviderIdentities] ([Provider], [ProviderUserId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ProviderProducts_Provider_ResourceType_ProductId] ON [dbo].[ProviderProducts] ([Provider], [ResourceType], [ProductId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    CREATE UNIQUE INDEX [IX_ProviderWebhookEvents_Provider_EventKey] ON [dbo].[ProviderWebhookEvents] ([Provider], [EventKey]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260920214444_AddAccessQuotasAndProviderInfrastructure'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260920214444_AddAccessQuotasAndProviderInfrastructure', N'8.0.30');
END;
GO

COMMIT;
GO

