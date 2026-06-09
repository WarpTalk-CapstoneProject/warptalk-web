DO $$ 
DECLARE
    v_user_id uuid := '019ea677-6c84-7d7b-9f48-738b3cde41a9';
    v_workspace_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO auth.workspaces (id, name, owner_id, slug)
    VALUES (v_workspace_id, 'Default Workspace', v_user_id, 'default-workspace')
    ON CONFLICT DO NOTHING;

    -- If the user already had a workspace, just get one
    SELECT id INTO v_workspace_id FROM auth.workspaces LIMIT 1;

    INSERT INTO translation_room.translation_rooms (workspace_id, host_id, title, description, translation_room_code, status, translation_room_type, max_participants, source_language, target_languages)
    VALUES 
    (v_workspace_id, v_user_id, 'Investor Q&A Translation', 'Live multilingual room for product due diligence.', 'WARP-241', 'IN_PROGRESS', 'SCHEDULED', 24, 'en-US', '["vi-VN", "ja-JP"]'),
    (v_workspace_id, v_user_id, 'Partner Sync Room', 'Scheduled interpretation room for APAC stakeholders.', 'SYNC-882', 'SCHEDULED', 'SCHEDULED', 12, 'vi-VN', '["en-US"]'),
    (v_workspace_id, v_user_id, 'Customer Onboarding', 'Waiting room for enterprise onboarding and support.', 'CUST-104', 'WAITING', 'SCHEDULED', 16, 'en-US', '["ko-KR", "vi-VN"]'),
    (v_workspace_id, v_user_id, 'Board Review Translation', 'Completed session with transcript artifacts ready.', 'BORD-778', 'ENDED', 'SCHEDULED', 20, 'en-US', '["vi-VN"]')
    ON CONFLICT DO NOTHING;
END $$;
