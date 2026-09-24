/**
 * Centralized API endpoints matching Gateway YARP routes.
 * Base URL is set in apiClient (NEXT_PUBLIC_API_URL).
 */

/** The query string a minutes export takes, with absent values left out entirely. WT-685. */
function minutesExportQuery(values: { template?: string; lang?: string; mode?: string }): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const API = {
  auth: {
    /** Upload/replace the signed-in user's avatar (multipart). */
    avatar: "/auth/profile/avatar",
    register: "/auth/register",
    registerInvited: "/auth/register-invited",
    login: "/auth/login",
    googleLogin: "/auth/google-login",
    /** Attach Google to the signed-in account. Body `{ idToken }`; the Google email must match. */
    googleLink: "/auth/google/link",
    /** Detach Google. Refused (MIN_AUTH_METHOD_REQUIRED) when the account has no password. */
    googleUnlink: "/auth/google/unlink",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    changePassword: "/auth/change-password",
    settings: "/auth/settings",
    /**
     * WT-597: a new verification link, asked for by address rather than by session.
     *
     * `/auth/resend-verification` is `[Authorize]`, and a self-registered account has no session
     * until it is verified — so the only resend the product had was unreachable by the people who
     * needed it. Answers 204 for any address, so it says nothing about who has an account.
     */
    resendVerification: "/auth/resend-verification-request",
    /**
     * The caller's own signed-in sessions (refresh-token families). There is deliberately no
     * endpoint for ending the CURRENT one here — that is `logout`, which clears the cookies in the
     * same response; the server answers 409 if `revokeSession` is pointed at it.
     */
    sessions: "/auth/sessions",
    revokeSession: (id: string) => `/auth/sessions/${id}`,
    revokeOtherSessions: "/auth/sessions/revoke-others",
  },
  voiceProfiles: {
    list: "/auth/voice-profiles",
    create: "/auth/voice-profiles",
    delete: (id: string) => `/auth/voice-profiles/${id}`,
    catalog: "/auth/voice-profiles/catalog",
    preferredVoice: "/auth/voice-profiles/preferred-voice",
    // WT-396. The OTHER direction from preferredVoice, and the separation is the bug that was
    // fixed: preferredVoice is the voice you HEAR other people in, this is the voice YOU are
    // dubbed in. They shared a concept, so an uploaded recording of yourself changed neither.
    dubVoice: "/auth/voice-profiles/dub-voice",
    // Hear a voice before a meeting instead of during one. POST because the first call for a
    // voice does real work on the AI side; later calls for the same (voice, language) are
    // served from that render.
    preview: "/auth/voice-profiles/preview",
    /**
     * The recording somebody uploaded, played back to them — NOT the clone.
     *
     * Separate from `preview` because they answer different questions: preview is the clone
     * speaking a fixed sentence, this is the original. Hearing one without the other says nothing
     * about how good the clone is.
     */
    sample: (profileId: string) => `/auth/voice-profiles/${profileId}/sample`,
    /**
     * Clone a failed profile again from its STORED recording — for failures that were not the
     * recording's fault (the provider account, an outage). Only valid while status is
     * "clone_failed"; see lib/voice/clone-failure.ts for when the page offers it.
     */
    retryClone: (profileId: string) => `/auth/voice-profiles/${profileId}/clone/retry`,
  },
  // Consent to voice cloning. Separate from voiceProfiles because it is permission, not a
  // profile: it is given once for the product, outlives any single profile or meeting, and is
  // the thing AuthService is asked about over gRPC before a route may enable cloning.
  voiceConsent: {
    status: "/auth/voice-consent",
    grant: "/auth/voice-consent/grant",
    revoke: "/auth/voice-consent/revoke",
  },
  translationRooms: {
    create: "/translation-rooms",
    list: "/translation-rooms",
    history: "/translation-rooms/history",
    /** WT-333 — the caller's own meetings in one workspace, past and upcoming (UC 25). */
    myMeetings: "/translation-rooms/my-meetings",
    join: "/translation-rooms/join",
    /**
     * WT-468 — the languages the pre-join screen may offer for a room CODE, decided by the
     * workspace that OWNS the room rather than by whichever workspace the joiner has selected.
     *
     * Always 200. An unknown or half-typed code answers with an empty list, which means
     * "unrestricted" here exactly as it does everywhere else a policy list travels — so this is
     * safe to call on every keystroke and is not a room-existence probe.
     */
    joinLanguagePolicy: (code: string) =>
      `/translation-rooms/join-language-policy/${encodeURIComponent(code)}`,
    /**
     * WT-480 — who a finished meeting's record is shared with: its transcript, AI summary and
     * recording together.
     *
     * Its own route rather than a field on the settings PUT, because that endpoint refuses any
     * room past WAITING and this act only makes sense once the meeting has ended.
     */
    artifactAccess: (id: string) => `/translation-rooms/${id}/artifact-access`,
    get: (id: string) => `/translation-rooms/${id}`,
    participants: (id: string) => `/translation-rooms/${id}/participants`,
    invitations: (id: string) => `/translation-rooms/${id}/invitations`,
    /** The invitee's RSVP. Not a join — the meeting is usually still ahead of them. */
    acceptInvitation: (id: string) => `/translation-rooms/${id}/invitations/accept`,
    participantAudio: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/audio`,
    admitParticipant: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/admit`,
    kickParticipant: (id: string, participantId: string) =>
      `/translation-rooms/${id}/participants/${participantId}/kick`,
    leave: (id: string) => `/translation-rooms/${id}/participants/me/leave`,
    start: (id: string) => `/translation-rooms/${id}/start`,
    pause: (id: string) => `/translation-rooms/${id}/pause`,
    /** Start Translation. `/start` only opens the room — see ResumeTranslationRoomAsync. */
    resume: (id: string) => `/translation-rooms/${id}/resume`,
    /** Stop Translation and leave the meeting (and its transcript) running. Not `/pause`. */
    stopTranslation: (id: string) => `/translation-rooms/${id}/translation/stop`,
    end: (id: string) => `/translation-rooms/${id}/end`,
    cancel: (id: string) => `/translation-rooms/${id}/cancel`,
    artifacts: (id: string) => `/translation-rooms/${id}/artifacts`,
    settings: (id: string) => `/translation-rooms/${id}/settings`,
    feedbackState: (id: string) => `/translation-rooms/${id}/feedback/me`,
    feedback: (id: string) => `/translation-rooms/${id}/feedback`,
    preflight: (roomCode: string) => `/translation-rooms/preflight/${roomCode}`,
    generateAudioRoutes: (id: string) => `/translation-rooms/${id}/audio-routes/generate`,
    voiceCloneConsent: (id: string) => `/translation-rooms/${id}/audio-routes/voice-clone-consent`,
    // Carries no voice id. The dub voice is a user setting owned by AuthService and is written
    // there; this only tells the room to go and re-read it, so the change reaches the AI
    // pipeline without waiting for the next join or restart to trigger a publish.
    refreshDubVoice: (id: string) => `/translation-rooms/${id}/audio-routes/dub-voice/refresh`,
    // WT-B "flash mode": stream audio to STT while a speaker is still talking. A ROOM setting —
    // GET is open to any participant so a guest renders the switch in the host's position, PUT
    // is host-only and answers 403 to anyone else.
    flashMode: (id: string) => `/translation-rooms/${id}/audio-routes/flash-mode`,
    noiseReduction: (id: string) =>
      `/translation-rooms/${id}/audio-routes/noise-reduction`,
    // NOT a setting — the browser telling the server what its OWN denoiser ended up doing. Krisp
    // runs entirely client-side and fails silently (livekit-client never awaits the entitlement
    // answer), so without this the only record of "it is not running" is a console.error in one
    // participant's tab.
    noiseSuppressionReport: (id: string) =>
      `/translation-rooms/${id}/audio-routes/noise-suppression/report`,
    calendarIcs: (id: string) => `/translation-rooms/${id}/calendar.ics`,
    sessions: (id: string) => `/translation-rooms/${id}/sessions`,
  },
  // WT-327: the recurring BOOKING, not its meetings. Creating one goes through
  // translationRooms.create with a `recurrence` block; these two are about the series itself.
  translationRoomSeries: {
    get: (id: string) => `/translation-room-series/${id}`,
    update: (id: string) => `/translation-room-series/${id}`,
    cancel: (id: string, keepOccurrenceId?: string) =>
      // WT-548: `keep` names the occurrence the host is looking at, which the server
      // leaves scheduled. Without it, stopping the schedule cancels that meeting too.
      keepOccurrenceId
        ? `/translation-room-series/${id}/cancel?keep=${encodeURIComponent(keepOccurrenceId)}`
        : `/translation-room-series/${id}/cancel`,
  },
  roomArtifacts: {
    download: (id: string) => `/room-artifacts/${id}/download`,
    consent: (id: string) => `/room-artifacts/${id}/consent`,
    regenerateSummary: (roomId: string) =>
      `/room-artifacts/rooms/${roomId}/summary/regenerate`,
    // WT-669 — what became of one queued rewrite. The request answers 202 and everything after
    // that happens out of the caller's sight, so this is where the reason lives when it goes
    // wrong. Keyed by the request's own id: it is one person's click, not part of the room.
    summaryRewriteStatus: (roomId: string, requestId: string) =>
      `/room-artifacts/rooms/${roomId}/summary/regenerate/${requestId}`,
    // Reading a meeting in a shape and language. A GET that can cause work: the first reader of
    // a pair nobody has asked for gets a 202 and the answer lands a moment later. It never
    // changes what any other reader sees, which is what separates it from regenerateSummary.
    summary: (roomId: string, template: string, language?: string) => {
      const query = new URLSearchParams({ template });
      // Only when chosen. An absent `language` and an empty one mean the same thing to the
      // server, but sending the empty one makes two spellings of one request — and so two
      // entries in anything that keys on the URL.
      if (language) query.set("language", language);
      return `/room-artifacts/rooms/${roomId}/summary?${query.toString()}`;
    },
    summaryRenderings: (roomId: string) =>
      `/room-artifacts/rooms/${roomId}/summary/renderings`,
  },
  // Biên bản họp. Its own group rather than an artifact route: minutes are not an output a job
  // produced, they are a record with a lifecycle and a signature.
  minutes: {
    byRoom: (roomId: string) => `/rooms/${roomId}/minutes`,
    // Reading the record in a language it was not drawn up in. A GET that can cause work —
    // the first reader of a language pays for a model call and the answer lands a moment
    // later — but it writes nothing to the document.
    translation: (roomId: string, language: string) =>
      `/rooms/${roomId}/minutes/translation?language=${encodeURIComponent(language)}`,
    draft: (roomId: string) => `/rooms/${roomId}/minutes/draft`,
    update: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}`,
    secretary: (roomId: string, minutesId: string) =>
      `/rooms/${roomId}/minutes/${minutesId}/secretary`,
    sign: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/sign`,
    approve: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/approve`,
    revise: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/revise`,
    /**
     * WT-685: `lang` is the one language the file is in (absent = the original) and
     * `mode=bilingual` puts the original beside exactly that language.
     */
    exportDocx: (roomId: string, template?: string, lang?: string, mode?: string) =>
      `/rooms/${roomId}/minutes/export.docx${minutesExportQuery({ template, lang, mode })}`,
    /**
     * The same document, converted from that .docx — never a second layout, so the query means
     * exactly what it means above.
     */
    exportPdf: (roomId: string, template?: string, lang?: string, mode?: string) =>
      `/rooms/${roomId}/minutes/export.pdf${minutesExportQuery({ template, lang, mode })}`,
    /** The share dialog's state. GET creates the link, restricted, on first ask. */
    share: (roomId: string) => `/rooms/${roomId}/minutes/share`,
    /** Email travels in the query string: an address contains characters a route segment does not. */
    sharePerson: (roomId: string, email: string) =>
      `/rooms/${roomId}/minutes/share/people?email=${encodeURIComponent(email)}`,
    sharePeople: (roomId: string) => `/rooms/${roomId}/minutes/share/people`,
    /**
     * Every current biên bản in the workspace this caller may read.
     *
     * Anchored on the workspace rather than on a room because the Artifacts library asks a
     * question no room can answer: which meetings left a written record at all. The gateway
     * routes this one path to the translation-room service ahead of its own workspaces
     * catch-all — see workspace-minutes-route.
     */
    forWorkspace: (workspaceId: string) => `/workspaces/${workspaceId}/minutes`,
  },
  /**
   * Reading a biên bản from a share link.
   *
   * The only unauthenticated routes the web calls. The token IS the credential, so these are
   * requested through publicApiClient — which never refreshes a session or redirects to /login
   * on a 401, because a visitor with no account is not an expired session.
   */
  sharedMinutes: {
    byToken: (token: string) => `/shared/minutes/${encodeURIComponent(token)}`,
    exportDocx: (token: string, template?: string) =>
      `/shared/minutes/${encodeURIComponent(token)}/export.docx`
      + (template ? `?template=${encodeURIComponent(template)}` : ""),
    exportPdf: (token: string, template?: string) =>
      `/shared/minutes/${encodeURIComponent(token)}/export.pdf`
      + (template ? `?template=${encodeURIComponent(template)}` : ""),
  },
  // Work a meeting produced. Readable where the meeting is; closeable by the person it was
  // given to, or the host.
  actionItems: {
    forRoom: (roomId: string) => `/rooms/${roomId}/action-items`,
    mine: (workspaceId: string) => `/workspaces/${workspaceId}/action-items/mine`,
    status: (itemId: string) => `/action-items/${itemId}/status`,
  },
  transcripts: {
    start: "/transcripts",
    get: (id: string) => `/transcripts/${id}`,
    byRoom: (translationRoomId: string) => `/transcripts/by-room/${translationRoomId}`,
    // WT-605. Keyed by ROOM, not by transcript id, exactly as TranscriptsController declares
    // them — the host pressing this has a room open, not a transcript id in hand.
    //
    // Not to be confused with `translationRooms.pause` further down: that one stops the AI
    // workers translating and dubbing. These stop only the written record growing, while
    // translation, dubbing, subtitles and LiveKit carry on.
    pauseByRoom: (translationRoomId: string) =>
      `/transcripts/by-room/${translationRoomId}/pause`,
    resumeByRoom: (translationRoomId: string) =>
      `/transcripts/by-room/${translationRoomId}/resume`,
    /** Readable by every participant, not just the host — the notice is for the whole room. */
    pauseWindows: (translationRoomId: string) =>
      `/transcripts/by-room/${translationRoomId}/pause-windows`,
    segments: (id: string) => `/transcripts/${id}/segments`,
    translations: (id: string) => `/transcripts/${id}/translations`,
    translationCoverage: (id: string) => `/transcripts/${id}/translations/coverage`,
    translationBackfill: (id: string) => `/transcripts/${id}/translations/backfill`,
    exports: (id: string) => `/transcripts/${id}/exports`,
    exportDownload: (id: string, exportId: string) => `/transcripts/${id}/exports/${exportId}/download`,
    correctSegment: (id: string, segmentId: string) => `/transcripts/${id}/segments/${segmentId}/correct`,
    corrections: (id: string, segmentId: string) => `/transcripts/${id}/segments/${segmentId}/corrections`,
    audio: (id: string) => `/transcripts/${id}/audio`,
    finalize: (id: string) => `/transcripts/${id}/finalize`,
  },
  notifications: {
    base: "/notifications",
    preferences: "/notifications/preferences",
    read: (id: string) => `/notifications/${id}/read`,
    readAll: "/notifications/read-all",
    adminBase: "/admin/notifications",
  },
  meetings: {
    join: (translationRoomId: string) => `/meetings/rooms/${translationRoomId}/join`,

    /** WT-525: publish-only token for the EXTERNAL_BRIDGE stand-in seat. Host-only, bridge-rooms-only. */

    bridgeToken: (translationRoomId: string) => `/meetings/rooms/${translationRoomId}/bridge-token`,
    triggerAi: (translationRoomId: string) => `/meetings/rooms/${translationRoomId}/trigger-ai`,
    chatList: (roomId: string) => `/meetings/rooms/${roomId}/chat`,
    chatSend: (roomId: string) => `/meetings/rooms/${roomId}/chat`,
    chatSendFile: (roomId: string) => `/meetings/rooms/${roomId}/chat/files`,
    chatDownload: (roomId: string, messageId: string) =>
      `/meetings/rooms/${roomId}/chat/files/${messageId}/download`,
    chatTranslate: (roomId: string, messageId: string) => `/meetings/rooms/${roomId}/chat/${messageId}/translate`,
    chatModerate: (roomId: string, messageId: string) => `/meetings/rooms/${roomId}/chat/${messageId}/moderate`,
    rejectParticipant: (roomId: string, participantId: string) => `/meetings/rooms/${roomId}/participants/${participantId}/reject`,
    transferHost: (roomId: string, newHostId: string) => `/meetings/rooms/${roomId}/transfer-host/${newHostId}`,
    muteParticipant: (roomId: string, participantId: string) =>
      `/meetings/rooms/${roomId}/participants/${participantId}/mute`,
    kickParticipant: (roomId: string, participantId: string) => `/meetings/rooms/${roomId}/participants/${participantId}/kick`,
    endMeeting: (roomId: string) => `/meetings/rooms/${roomId}/end`,
    setLock: (roomId: string) => `/meetings/rooms/${roomId}/lock`,
    setMuteOnEntry: (roomId: string) => `/meetings/rooms/${roomId}/mute-on-entry`,
    setRecording: (roomId: string) => `/meetings/rooms/${roomId}/recording`,
  },
  workspaces: {
    base: "/workspaces",
    list: "/workspaces",
    get: (id: string) => `/workspaces/${id}`,
    select: (id: string) => `/workspaces/${id}/select`,
    settings: (id: string) => `/workspaces/${id}/settings`,
    entitlements: (id: string) => `/workspaces/${id}/entitlements`,
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`,
    memberDetail: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}`,
    memberRole: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role`,
    memberRoleChangePreview: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role-change-preview`,
    memberRoleChange: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role-change`,
    transferOwnership: (workspaceId: string) => `/workspaces/${workspaceId}/members/transfer-ownership`,
    verifiedDomains: (workspaceId: string) => `/workspaces/${workspaceId}/verified-domains`,
    /** Owner/Admin only. Staff actions on this workspace, actor redacted server-side. */
    auditLog: (workspaceId: string) => `/workspaces/${workspaceId}/audit-log`,
    verifiedDomainDetail: (workspaceId: string, domainId: string) =>
      `/workspaces/${workspaceId}/verified-domains/${domainId}`,
    invitations: (workspaceId: string) => `/workspaces/${workspaceId}/invitations`,
    invitationPolicy: (workspaceId: string) => `/workspaces/${workspaceId}/invitations/policy`,
    retryInvitation: (workspaceId: string, inviteId: string) => `/workspaces/${workspaceId}/invitations/${inviteId}/retry-delivery`,
    revokeInvitation: (workspaceId: string, inviteId: string) => `/workspaces/${workspaceId}/invitations/${inviteId}`,
    previewInvitation: (token: string) => `/workspaces/invitations/preview?token=${encodeURIComponent(token)}`,
    pendingInvitations: "/workspaces/invitations/pending",
    acceptInvitation: "/workspaces/invitations/accept",
    acceptInvitationById: (inviteId: string) => `/workspaces/invitations/${inviteId}/accept`,
    joinRequests: "/workspaces/join-requests",
    approveJoinRequest: (workspaceId: string, inviteId: string) => `/workspaces/${workspaceId}/join-requests/${inviteId}/approve`,
    rejectJoinRequest: (workspaceId: string, inviteId: string) => `/workspaces/${workspaceId}/join-requests/${inviteId}/reject`,
    leaveRequests: (workspaceId: string) => `/workspaces/${workspaceId}/leave-requests`,
    approveLeaveRequest: (workspaceId: string, leaveRequestId: string) => `/workspaces/${workspaceId}/leave-requests/${leaveRequestId}/approve`,
    rejectLeaveRequest: (workspaceId: string, leaveRequestId: string) => `/workspaces/${workspaceId}/leave-requests/${leaveRequestId}/reject`,
    documents: (workspaceId: string) => `/workspaces/${workspaceId}/documents`,
    knowledge: (workspaceId: string) => `/workspaces/${workspaceId}/knowledge`,
    knowledgeChunk: (workspaceId: string, chunkId: string) =>
      `/workspaces/${workspaceId}/knowledge/${encodeURIComponent(chunkId)}`,
    documentDetail: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}`,
    documentExtractedText: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/extracted-text`,
    documentApprove: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/approve`,
    /** Takes a published document back from the workspace: public → private. */
    documentUnpublish: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/unpublish`,
    /** Shares a private document again — directly for an owner/admin, back through approval for the uploader. */
    documentPublish: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/publish`,
    /** Replaces a rejected document's file in place, keeping its id and its history. WT-633. */
    documentRevision: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/revision`,
    /** A document's approval and feedback history, newest first. WT-633. */
    documentHistory: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/history`,
    documentDownload: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/download`,
    documentPolicies: (workspaceId: string, docId: string) => `/workspaces/${workspaceId}/documents/${docId}/policies`,
    documentPolicyDetail: (workspaceId: string, docId: string, policyId: string) => `/workspaces/${workspaceId}/documents/${docId}/policies/${policyId}`,
  },
  glossaries: {
    base: "/glossaries",
    get: (id: string) => `/glossaries/${id}`,
    byWorkspace: (workspaceId: string) => `/glossaries/workspace/${workspaceId}`,
    terms: (id: string) => `/glossaries/${id}/terms`,
    /**
     * WT-472 — a whole spreadsheet in one request. Adding terms one POST at a time made a
     * hundred-row import a hundred round trips, and left `Glossary.TermCount` describing a
     * glossary that did not exist if the client died halfway.
     */
    bulkTerms: (id: string) => `/glossaries/${id}/terms/bulk`,
    termDetail: (id: string, termId: string) => `/glossaries/${id}/terms/${termId}`,
    global: "/glossaries/global",
  },
  assistant: {
    conversations: "/assistant/conversations",
    conversation: (id: string) => `/assistant/conversations/${id}`,
    sendMessage: (id: string) => `/assistant/conversations/${id}/messages`,
    /**
     * Platform-scope WarpBot (system admins, admin portal). A separate store behind the
     * system-admin policy — never the workspace routes above with an empty workspace id.
     */
    platform: {
      conversations: "/assistant/platform/conversations",
      conversation: (id: string) => `/assistant/platform/conversations/${id}`,
      sendMessage: (id: string) => `/assistant/platform/conversations/${id}/messages`,
    },
    skills: "/assistant/skills",
    plugins: "/assistant/plugins",
    installPlugin: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/install`,
    disablePlugin: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}`,
    pluginConnection: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/connection`,
    /** WT-687: PUT `{ tools: { [toolName]: "allow" | "approval" | "blocked" } }`, merged per tool. */
    pluginToolPolicy: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/tool-policy`,
    /**
     * `client` tells the API which surface is asking, so it can seal that into the OAuth state.
     * The desktop app opens consent in the system browser, and by the time the callback runs
     * nothing on that request remembers which app started it.
     */
    /** POST `{ apiKey }` — connects an `api_key` plugin with the caller's own key. */
    pluginApiKey: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/api-key`,
    pluginConnect: (pluginKey: string, client?: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/connect` +
      (client ? `?client=${encodeURIComponent(client)}` : ""),
    /**
     * Which plugin tools WarpBot ran in one workspace, newest first. Owner/Admin of that workspace
     * only — the assistant service asks the workspace service for the caller's role and fails
     * closed. Query: `workspaceId` (required), `pluginKey`, `userId`, `skip`, `take` (clamped to
     * 200 server-side). Not the system-admin audit under `adminPluginCatalog.audits`.
     */
    workspacePluginToolAudits: "/assistant/mcp/tools/audits",
    /**
     * The workspace half of the plugin marketplace (2026-09-17). Its own prefix rather than more
     * literals under `/assistant/plugins`, where every literal beside `{pluginKey}` reserves a key.
     * Authorised against the workspace in the path: reads Owner/Admin, writes Owner, requests any
     * active member.
     */
    workspacePlugins: {
      base: (workspaceId: string) => `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins`,
      marketplace: (workspaceId: string, pluginKey: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/marketplace/${encodeURIComponent(pluginKey)}`,
      plugin: (workspaceId: string, pluginKey: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/${encodeURIComponent(pluginKey)}`,
      private: (workspaceId: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/private`,
      privatePlugin: (workspaceId: string, pluginKey: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/private/${encodeURIComponent(pluginKey)}`,
      /** Members who connected the plugin — Owner or Admin; connection metadata only. */
      members: (workspaceId: string, pluginKey: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/${encodeURIComponent(pluginKey)}/members`,
      requests: (workspaceId: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/requests`,
      myRequests: (workspaceId: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/requests/mine`,
      approveRequest: (workspaceId: string, requestId: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/requests/${encodeURIComponent(requestId)}/approve`,
      declineRequest: (workspaceId: string, requestId: string) =>
        `/assistant/workspaces/${encodeURIComponent(workspaceId)}/plugins/requests/${encodeURIComponent(requestId)}/decline`,
    },
  },
  /**
   * The system-admin half of the plugin catalog (assistant service, WT-646).
   *
   * Separate from `assistant.plugins` above because the audiences are separate: those routes are
   * what a signed-in user's plugins page calls, these write the global catalog every user reads
   * and are gated on the platform-admin policy. Keeping them apart is what stops a user-facing
   * component reaching for an admin URL by autocomplete.
   *
   * `catalog` is a RESERVED plugin key on the server for the reason this shape makes visible: it
   * is a literal route segment sitting where `{pluginKey}` sits, and ASP.NET gives the literal
   * precedence.
   */
  adminPluginCatalog: {
    base: "/assistant/plugins/catalog",
    detail: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}`,
    oauth: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/oauth`,
    tools: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/tools`,
    rediscover: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/rediscover`,
    audits: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/audits`,
  },
  /**
   * Which workspaces a marketplace plugin reaches (2026-09-25): its default, per-workspace
   * overrides (bulk by id and/or plan), and both views. Platform-admin only. The workspace-centric
   * routes live under `/assistant/admin/workspaces` so no literal sits beside `{pluginKey}`.
   */
  adminPluginWorkspaceAccess: {
    workspaces: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/workspaces`,
    availability: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/availability`,
    overrides: (pluginKey: string) =>
      `/assistant/plugins/catalog/${encodeURIComponent(pluginKey)}/workspaces/overrides`,
    workspacePlugins: (workspaceId: string) =>
      `/assistant/admin/workspaces/${encodeURIComponent(workspaceId)}/plugins`,
    workspaceOverride: (workspaceId: string, pluginKey: string) =>
      `/assistant/admin/workspaces/${encodeURIComponent(workspaceId)}/plugins/${encodeURIComponent(pluginKey)}/override`,
  },
  /**
   * The platform user directory (auth service). The account actions below audit over gRPC to
   * the workspace service's audit store — the transport that can refuse — which is what ended
   * the "no bus, so no privileged actions" era.
   */
  adminUsers: {
    base: "/admin/users",
    detail: (id: string) => `/admin/users/${id}`,
    /**
     * The three privileged actions, all POST and all requiring a reason.
     *
     * POST rather than DELETE on revoke-sessions because nothing is removed: the refresh tokens
     * stay as rows carrying a revocation time, which is what lets the account's history still
     * show it was signed in and when that stopped.
     *
     * There is still no delete. A user's rows reach transcripts, voice profiles and billing
     * across four services — removing one is a data-lifecycle decision, not a button on a table.
     */
    revokeSessions: (id: string) => `/admin/users/${id}/revoke-sessions`,
    deactivate: (id: string) => `/admin/users/${id}/deactivate`,
    reactivate: (id: string) => `/admin/users/${id}/reactivate`,
    unlock: (id: string) => `/admin/users/${id}/unlock`,
    /**
     * POST `{ userIds, reason }`. Force sign-out from the admin workspace page — one member or all
     * of them. Each account gets the same audited revoke as `revokeSessions`, filed under the
     * workspace in the route so it appears on that workspace's timeline.
     */
    workspaceSignOut: (workspaceId: string) => `/admin/users/workspaces/${workspaceId}/revoke-sessions`,
  },
  /** Platform subscription directory and revenue summary (billing service). Read-only. */
  /**
   * Plans and rate cards. These live on the ordinary plans/usages controllers rather than under
   * /admin — they predate the portal and are gated per-route on the platform admin role.
   */
  adminPricing: {
    /** Platform billing policy — today a single knob, the VAT rate. GET/PUT, admin-gated. */
    billingPolicy: "/billing-policy",
    allPlans: "/plans/all",
    /** POST creates a plan (2026-08-17). Still no DELETE — a plan names itself on every invoice
     * ever issued against it, so a retired plan is deactivated in place rather than removed. */
    plans: "/plans",
    plan: (id: string) => `/plans/${id}`,
    /** GET reads the active cards; PUT upserts one, matched on its identity columns. */
    rateCard: "/usages/rate-card",
    /** POST. Retires one row (is_active=false, effective_to=now); never a delete. */
    rateCardDeactivate: (id: string) => `/usages/rate-card/${id}/deactivate`,
    /** POST. Read-only: prices a proposed cost and markup without publishing anything. */
    rateCardPreview: "/usages/rate-card/preview",
    /** PUT. Records the provider cost of a credit-unit (CRD) card; its credit price stays. */
    rateCardProviderCost: (id: string) => `/usages/rate-card/${id}/provider-cost`,
    pricingConfig: "/usages/pricing-config",
  },
  /** The platform audit log. Read-only; the store is append-only. */
  /** Platform announcements. Read-only in the UI; sending is its own release. */
  adminAnnouncements: {
    base: "/admin/notifications",
    detail: (id: string) => `/admin/notifications/${encodeURIComponent(id)}`,
  },
  /**
   * The announcements CMS (notification service). Nested under /admin/notifications so it rides
   * the gateway route that already exists rather than widening the approved admin surface.
   */
  adminAnnouncementCms: {
    base: "/admin/notifications/announcements",
    detail: (id: string) => `/admin/notifications/announcements/${encodeURIComponent(id)}`,
    publish: (id: string) => `/admin/notifications/announcements/${encodeURIComponent(id)}/publish`,
    unpublish: (id: string) => `/admin/notifications/announcements/${encodeURIComponent(id)}/unpublish`,
    archive: (id: string) => `/admin/notifications/announcements/${encodeURIComponent(id)}/archive`,
    duplicate: (id: string) => `/admin/notifications/announcements/${encodeURIComponent(id)}/duplicate`,
  },
  /** The email template CMS (notification service). Every sender reads what is saved here. */
  adminEmailTemplates: {
    base: "/admin/notifications/email-templates",
    detail: (key: string) => `/admin/notifications/email-templates/${encodeURIComponent(key)}`,
    preview: (key: string) => `/admin/notifications/email-templates/${encodeURIComponent(key)}/preview`,
    test: (key: string) => `/admin/notifications/email-templates/${encodeURIComponent(key)}/test`,
    versions: (key: string) => `/admin/notifications/email-templates/${encodeURIComponent(key)}/versions`,
    restore: (key: string, version: number) =>
      `/admin/notifications/email-templates/${encodeURIComponent(key)}/versions/${version}/restore`,
  },
  /** Announcements as the signed-in user sees them: live, meant for them, not dismissed. */
  announcements: {
    active: "/notifications/announcements",
    dismiss: (id: string) => `/notifications/announcements/${encodeURIComponent(id)}/dismiss`,
  },
  /**
   * The workspace service's transactional outbox, dead-lettered half. Not under /admin: the
   * controller lives on the workspace service's own prefix and is gated there. Other services'
   * outboxes are not reachable from here.
   */
  adminWorkspaceOutbox: {
    deadLetters: "/workspaces/outbox/dead-letters",
  },
  adminAuditLog: {
    base: "/admin/audit-log",
  },
  adminMeetings: {
    counts: "/admin/meetings/counts",
  },
  /**
   * The Insights page (`/admin`). One period endpoint per owning service plus billing's "right now"
   * snapshot; each rides its service's existing admin gateway route. Built alongside the page, so
   * any of them may 404 on an older backend — the page shows that source as not available yet.
   */
  adminInsights: {
    billing: "/admin/billing/insights",
    billingSnapshot: "/admin/billing/insights/snapshot",
    users: "/admin/users/insights",
    workspaces: "/admin/workspaces/insights",
    meetings: "/admin/meetings/insights",
    pnl: "/admin/billing/insights/pnl",
  },
  /** The USD→VND rate: Stripe's by default, recorded daily, overridable. System admin only. */
  adminFx: {
    status: "/admin/billing/fx",
    refresh: "/admin/billing/fx/refresh",
    override: "/admin/billing/fx/override",
  },
  /**
   * The platform's own vitals, read back out of the metrics store. Query-only: nothing behind
   * this path can silence an alert, restart a container or write a sample.
   */
  adminPlatformHealth: {
    base: "/admin/platform-health",
  },
  /** Product feedback, aggregated. Read-only; comments carry no user id. */
  adminFeedback: {
    summary: "/admin/feedback/summary",
    comments: "/admin/feedback/comments",
  },
  /**
   * The catalog room validation reads — `translation_room.supported_languages`, inactive rows
   * included. Manageable since WT-691: each write is recorded in the platform audit log over gRPC
   * before it is saved. No delete — disable is the soft switch.
   */
  adminLanguages: {
    base: "/admin/languages",
    byCode: (code: string) => `/admin/languages/${encodeURIComponent(code)}`,
    enable: (code: string) => `/admin/languages/${encodeURIComponent(code)}/enable`,
    disable: (code: string) => `/admin/languages/${encodeURIComponent(code)}/disable`,
  },
  /** Voice-clone consent, counts only. No user ids cross this boundary. */
  adminVoiceConsent: {
    summary: "/admin/voice-consent/summary",
  },
  adminSubscriptions: {
    base: "/admin/subscriptions",
    summary: "/admin/subscriptions/summary",
    /**
     * Lifecycle actions are NOT under /admin. They live on the ordinary subscriptions controller,
     * keyed by workspace rather than by subscription id, and this is deliberate rather than an
     * oversight to tidy up: `SubscriptionService.CancelSubscriptionAsync` also cancels the Stripe
     * subscription, republishes entitlements and notifies the owner. A parallel admin-only route
     * would be a second, thinner path through the same commercial act — and the untested one.
     *
     * A platform admin is already allowed through: `RequireWorkspaceRoleFilter` short-circuits on
     * the platform "admin" role before it ever asks the workspace service about membership.
     */
    cancel: (workspaceId: string) => `/subscriptions/workspace/${workspaceId}`,
    /**
     * Undo a scheduled cancellation (renewal back on, period still running). Not `resume`: that
     * one lifts an AI-service suspension and refuses a cancelled-but-healthy subscription.
     */
    reactivate: (workspaceId: string) =>
      `/subscriptions/workspace/${workspaceId}/reactivate`,
    /** Lift an AI-service suspension (overage cap, overdue invoice). Unrelated to cancellation. */
    resume: (workspaceId: string) => `/subscriptions/workspace/${workspaceId}/resume`,
    /**
     * The one action that IS admin-only (2026-08-17): customers change plans through checkout,
     * which is exactly the step an administrative move must not require. Credits are untouched
     * by design — compensation is an explicit credit adjustment with its own audit row.
     */
    changePlan: (workspaceId: string) =>
      `/admin/subscriptions/workspace/${workspaceId}/change-plan`,
    contractTerms: (workspaceId: string) =>
      `/subscriptions/workspace/${workspaceId}/contract-terms`,
    /** POST. Creates a contract subscription; refused while the workspace has any active one. */
    createContract: "/subscriptions/contract",
    /** GET. The workspace's active subscription, contract overrides included. */
    active: (workspaceId: string) => `/subscriptions/workspace/${workspaceId}`,
  },
  /**
   * Bank-transfer reconciliation for contract workspaces. The invoices themselves are raised by
   * the billing-cycle close; the only admin write is settling one.
   */
  adminInvoices: {
    workspace: (workspaceId: string) => `/invoices/workspace/${workspaceId}`,
    /**
     * POST `{ reason }`. The audited door to mark-paid: system-admin POLICY (not the role string
     * the bare `/invoices/{id}/mark-paid` still carries), scoped to the workspace in the route, and
     * recorded in the platform audit log before the invoice and its payment are settled.
     */
    markPaid: (workspaceId: string, invoiceId: string) =>
      `/admin/billing/workspaces/${workspaceId}/invoices/${invoiceId}/mark-paid`,
  },
  /**
   * The platform-wide sales lead inbox (billing `AdminSalesLeadsController`). Under
   * /admin/billing so the gateway's existing admin-billing route carries it.
   */
  adminSalesLeads: {
    base: "/admin/billing/sales-leads",
    status: (id: string) => `/admin/billing/sales-leads/${id}/status`,
  },
  /** Per-workspace analytics + ledger, served by the billing service (WT-206). */
  adminWorkspaceAnalytics: {
    analytics: (id: string) => `/admin/billing/workspaces/${id}/analytics`,
    creditTransactions: (id: string) => `/admin/billing/workspaces/${id}/credit-transactions`,
  },
  /**
   * The admin workspace page's billing half (billing `AdminWorkspaceBillingController`): the money
   * overview the page leads with, and its money actions. Every write takes a reason and is recorded
   * in the platform audit log before it is saved.
   */
  adminWorkspaceBilling: {
    /** GET `?from&to` (default the last 30 days): revenue, credits + burn, plan, invoices, AI cost, P&L. */
    overview: (id: string) => `/admin/billing/workspaces/${id}/overview`,
    /** POST `{ amount, reason }`. Wired to CreditService; negative deducts; the ledger row is returned. */
    adjustCredits: (id: string) => `/admin/billing/workspaces/${id}/credits/adjust`,
    changePlan: (id: string) => `/admin/billing/workspaces/${id}/subscription/change-plan`,
    extendTrial: (id: string) => `/admin/billing/workspaces/${id}/subscription/extend-trial`,
    /** POST `{ periods, reason }`. Free months: paid-through date and credits, no invoice. */
    comp: (id: string) => `/admin/billing/workspaces/${id}/subscription/comp`,
    /** PUT `{ overrides, reason }`: contract entitlement overrides; null clears a key. */
    entitlements: (id: string) => `/admin/billing/workspaces/${id}/subscription/entitlements`,
  },
  adminWorkspaces: {
    base: "/admin/workspaces",
    detail: (id: string) => `/admin/workspaces/${id}`,
    // WT-560: the portal addresses a workspace by its own slug, so the admin's address bar
    // names the workspace instead of carrying its primary key.
    detailBySlug: (slug: string) => `/admin/workspaces/by-slug/${encodeURIComponent(slug)}`,
    suspend: (id: string) => `/admin/workspaces/${id}/suspend`,
    reactivate: (id: string) => `/admin/workspaces/${id}/reactivate`,
    delete: (id: string) => `/admin/workspaces/${id}/delete`,
    // Membership facts only. The knowledge route that used to sit beside these is gone:
    // tenant content stays out of the admin portal (2026-08-17).
    members: (id: string) => `/admin/workspaces/${id}/members`,
    // The admin workspace page's workspace-service actions. Each is audited; the export is a POST
    // because it carries a reason and is itself a recorded action.
    transferOwnership: (id: string) => `/admin/workspaces/${id}/transfer-ownership`,
    notices: (id: string) => `/admin/workspaces/${id}/notices`,
    notes: (id: string) => `/admin/workspaces/${id}/notes`,
    timeline: (id: string) => `/admin/workspaces/${id}/timeline`,
    export: (id: string) => `/admin/workspaces/${id}/export`,
  },
  /**
   * A workspace's own payments and invoices (billing service; gateway routes `/payments/**` and
   * `/invoices/**` to the billing cluster).
   */
  workspaceBilling: {
    /** GET. Owner/Admin of the workspace (RequireWorkspaceRole). Paginated. */
    paymentHistory: (workspaceId: string) => `/payments/workspace/${workspaceId}/history`,
    /**
     * POST, no body. Answers `{ url }` — a Stripe checkout page for one open invoice. Owner of the
     * invoice's workspace only; the server resolves the workspace from the invoice.
     */
    invoiceCheckout: (invoiceId: string) => `/invoices/${invoiceId}/checkout`,
  },
  adminGlobalGlossary: {
    base: "/admin/global-glossary",
    detail: (id: string) => `/admin/global-glossary/${id}`,
    publish: (id: string) => `/admin/global-glossary/${id}/publish`,
    archive: (id: string) => `/admin/global-glossary/${id}/archive`,
    bulkImport: "/admin/global-glossary/bulk-import",
    audits: (id: string) => `/admin/global-glossary/${id}/audits`,
  },
} as const;
