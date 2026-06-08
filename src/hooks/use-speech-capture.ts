import { useState, useEffect, useRef, useCallback } from "react";

interface UseSpeechCaptureProps {
  onAudioChunk: (base64Audio: string, chunkIndex: number) => void;
  chunkDurationMs?: number;
}

export function useSpeechCapture({
  onAudioChunk,
  chunkDurationMs = 1000,
}: UseSpeechCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndexRef = useRef(0);

  // We use standard MediaRecorder. For cross-browser compatibility, we try to use a format
  // that soundfile on the Python backend might be able to decode, or we rely on the
  // python backend having ffmpeg-based decoding if soundfile fails.
  // Ideally, the backend should use ffmpeg or pydub to handle webm/ogg.
  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunkIndexRef.current = 0;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          // Convert Blob to Base64
          const buffer = await e.data.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          onAudioChunk(base64, chunkIndexRef.current);
          chunkIndexRef.current += 1;
        }
      };

      // Start recording and slice chunks every chunkDurationMs
      recorder.start(chunkDurationMs);
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Failed to start speech capture:", err);
      setError(err instanceof Error ? err.message : "Microphone access denied");
    }
  }, [chunkDurationMs, onAudioChunk]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
