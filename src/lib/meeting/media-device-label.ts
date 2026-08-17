/**
 * WT-435 — naming a media device in the picker.
 *
 * `MediaDeviceInfo.label` is the empty string until the page holds a permission for that KIND.
 * So a camera list read while the camera has never been enabled is a list of blanks, and a
 * menu of three identical empty rows is worse than no menu: the user cannot tell which one
 * they are choosing, or which one they just chose.
 *
 * Pure and outside the component so it can be tested — the node test runner strips types but
 * cannot parse JSX.
 */

export type MediaDeviceKindLabel = "audioinput" | "audiooutput" | "videoinput";

export const DEVICE_KIND_LABELS: Record<MediaDeviceKindLabel, string> = {
  audioinput: "Microphone",
  audiooutput: "Speaker",
  videoinput: "Camera",
};

/**
 * A human name for a device.
 *
 * Falls back to a positional name rather than the raw deviceId — a deviceId is a 64-character
 * hash, which is not a thing anyone can pick from a list. The browser's own "default" and
 * "communications" pseudo-devices get named for what they are, since those two DO carry
 * meaning even when the label is blank.
 */
export function mediaDeviceLabel(
  device: { deviceId: string; label?: string },
  index: number,
  kind: MediaDeviceKindLabel,
): string {
  const label = device.label?.trim();
  if (label) return label;

  const kindLabel = DEVICE_KIND_LABELS[kind];
  if (device.deviceId === "default") return `Default ${kindLabel.toLowerCase()}`;
  if (device.deviceId === "communications") return `Communications ${kindLabel.toLowerCase()}`;

  return `${kindLabel} ${index + 1}`;
}
