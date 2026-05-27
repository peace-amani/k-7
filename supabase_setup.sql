
        CREATE TABLE IF NOT EXISTS bot_configs (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS warnings (
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            reasons JSONB DEFAULT '[]',
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (group_id, user_id)
        );
    

        CREATE TABLE IF NOT EXISTS warning_limits (
            group_id TEXT PRIMARY KEY,
            max_warnings INTEGER DEFAULT 3,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS sudoers (
            phone_number TEXT PRIMARY KEY,
            jid TEXT,
            added_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS sudo_config (
            id TEXT PRIMARY KEY DEFAULT 'main',
            sudomode BOOLEAN DEFAULT FALSE,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS lid_map (
            lid TEXT PRIMARY KEY,
            phone_number TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS chatbot_conversations (
            user_id TEXT PRIMARY KEY,
            conversation JSONB DEFAULT '[]',
            last_updated TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS chatbot_config (
            key TEXT PRIMARY KEY DEFAULT 'main',
            config JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS antidelete_messages (
            message_id TEXT PRIMARY KEY,
            chat_id TEXT,
            sender_id TEXT,
            message_data JSONB,
            timestamp BIGINT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS antidelete_statuses (
            status_id TEXT PRIMARY KEY,
            sender_id TEXT,
            sender_number TEXT,
            push_name TEXT,
            status_type TEXT,
            status_data JSONB,
            media_meta JSONB,
            has_media BOOLEAN DEFAULT FALSE,
            text_content TEXT,
            timestamp BIGINT,
            deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS welcome_goodbye (
            group_id TEXT PRIMARY KEY,
            welcome JSONB DEFAULT NULL,
            goodbye JSONB DEFAULT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    

        CREATE TABLE IF NOT EXISTS group_features (
            group_id TEXT NOT NULL,
            feature TEXT NOT NULL,
            config JSONB NOT NULL DEFAULT '{}',
            enabled BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (group_id, feature)
        );
    

        CREATE TABLE IF NOT EXISTS auto_configs (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    