/**
 * Centralized API endpoints matching Gateway YARP routes.
 * Base URL is set in apiClient (NEXT_PUBLIC_API_URL).
 */
export const API = {
  auth: {
    /** Upload/replace the signed-in user's avatar (multipart). */
    avatar: "/auth/profile/avatar",
    register: "/auth/register",
    registerInvited: "/auth/register-invited",
    login: "/auth/login",
    googleLogin: "/auth/google-login",
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
  },
  // Biên bản họp. Its own group rather than an artifact route: minutes are not an output a job
  // produced, they are a record with a lifecycle and a signature.
  minutes: {
    byRoom: (roomId: string) => `/rooms/${roomId}/minutes`,
    draft: (roomId: string) => `/rooms/${roomId}/minutes/draft`,
    update: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}`,
    sign: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/sign`,
    approve: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/approve`,
    revise: (roomId: string, minutesId: string) => `/rooms/${roomId}/minutes/${minutesId}/revise`,
    exportDocx: (roomId: string) => `/rooms/${roomId}/minutes/export.docx`,
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
    pollsList: (roomId: string) => `/meetings/rooms/${roomId}/polls`,
    pollsCreate: (roomId: string) => `/meetings/rooms/${roomId}/polls`,
    pollsVote: (roomId: string, pollId: string) => `/meetings/rooms/${roomId}/polls/${pollId}/vote`,
    pollsClose: (roomId: string, pollId: string) => `/meetings/rooms/${roomId}/polls/${pollId}/close`,
    questionsList: (roomId: string) => `/meetings/rooms/${roomId}/questions`,
    questionsAsk: (roomId: string) => `/meetings/rooms/${roomId}/questions`,
    questionsUpvote: (roomId: string, questionId: string) => `/meetings/rooms/${roomId}/questions/${questionId}/upvote`,
    questionsAnswer: (roomId: string, questionId: string) => `/meetings/rooms/${roomId}/questions/${questionId}/answer`,
    breakoutsStart: (roomId: string) => `/meetings/rooms/${roomId}/breakouts`,
    breakoutsEnd: (roomId: string) => `/meetings/rooms/${roomId}/breakouts/end`,
    breakoutsMyAssignment: (roomId: string) => `/meetings/rooms/${roomId}/breakouts/my-assignment`,
  },
  workspaces: {
    base: "/workspaces",
    list: "/workspaces",
    get: (id: string) => `/workspaces/${id}`,
    select: (id: string) => `/workspaces/${id}/select`,
    settings: (id: string) => `/workspaces/${id}/settings`,
    members: (workspaceId: string) => `/workspaces/${workspaceId}/members`,
    memberDetail: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}`,
    memberRole: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role`,
    memberRoleChangePreview: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role-change-preview`,
    memberRoleChange: (workspaceId: string, userId: string) => `/workspaces/${workspaceId}/members/${userId}/role-change`,
    transferOwnership: (workspaceId: string) => `/workspaces/${workspaceId}/members/transfer-ownership`,
    verifiedDomains: (workspaceId: string) => `/workspaces/${workspaceId}/verified-domains`,
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
    skills: "/assistant/skills",
    plugins: "/assistant/plugins",
    installPlugin: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/install`,
    disablePlugin: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}`,
    pluginConnection: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/connection`,
    pluginConnectUrl: (pluginKey: string) =>
      `/assistant/plugins/${encodeURIComponent(pluginKey)}/connect-url`,
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
    pricingConfig: "/usages/pricing-config",
  },
  /** Platform meeting directory (translation-room). Metadata only, read-only. */
  /** The platform audit log. Read-only; the store is append-only. */
  /** Platform announcements. Read-only in the UI; sending is its own release. */
  adminAnnouncements: {
    base: "/admin/notifications",
  },
  adminAuditLog: {
    base: "/admin/audit-log",
  },
  adminMeetings: {
    base: "/admin/meetings",
    counts: "/admin/meetings/counts",
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
   * included. Read-only: translation-room has no bus, so a toggle could not be audited.
   */
  adminLanguages: {
    base: "/admin/languages",
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
  },
  /** Per-workspace analytics + ledger, served by the billing service (WT-206). */
  adminWorkspaceAnalytics: {
    analytics: (id: string) => `/admin/billing/workspaces/${id}/analytics`,
    creditTransactions: (id: string) => `/admin/billing/workspaces/${id}/credit-transactions`,
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
