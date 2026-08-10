type ApiResponse<T> = Promise<{ data: T }>;

type TranscriptWithId = { id: string };
type SegmentPage<TSegment> = { items: TSegment[] };

type TranscriptHistoryApi<TTranscript extends TranscriptWithId, TSegment> = {
  getByRoom(roomId: string): ApiResponse<TTranscript>;
  segments(
    transcriptId: string,
    params: { skip: number; take: number },
  ): ApiResponse<SegmentPage<TSegment>>;
};

function responseStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  const response = error.response;
  if (typeof response !== "object" || response === null || !("status" in response)) {
    return undefined;
  }

  return typeof response.status === "number" ? response.status : undefined;
}

/**
 * Loads the persisted transcript for a room.
 *
 * A 404 from the transcript lookup means no transcript row exists, which is a valid
 * empty state. Every other failure must remain visible to React Query; otherwise a
 * gateway outage, authorization bug, or failed segments request is falsely rendered
 * as "No transcript recorded".
 */
export async function loadSavedTranscript<
  TTranscript extends TranscriptWithId,
  TSegment,
>(
  roomId: string,
  api: TranscriptHistoryApi<TTranscript, TSegment>,
): Promise<{ transcript: TTranscript; segments: TSegment[] } | null> {
  let transcript: TTranscript;

  try {
    ({ data: transcript } = await api.getByRoom(roomId));
  } catch (error) {
    if (responseStatus(error) === 404) return null;
    throw error;
  }

  const { data: paged } = await api.segments(transcript.id, {
    skip: 0,
    take: 500,
  });

  return { transcript, segments: paged.items };
}
