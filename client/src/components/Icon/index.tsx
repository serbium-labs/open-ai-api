import type { ReactElement } from "react";

export type IconName =
  | "attachment"
  | "microphone"
  | "pause"
  | "play"
  | "remove"
  | "send"
  | "stop";

export type IconProps = {
  name: IconName;
};

const ICON_PATHS: Record<IconName, string> = {
  attachment:
    "M16.5 6.5v9a4.5 4.5 0 0 1-9 0v-10a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V7h2v8a.5.5 0 0 0 1 0V5.5a2 2 0 0 0-4 0v10a2.5 2.5 0 0 0 5 0v-9h2Z",
  microphone:
    "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm-1 4v-2.1A5 5 0 0 1 7 12H5a7 7 0 0 0 6 6.93V21H8v2h8v-2h-3v-2.07A7 7 0 0 0 19 12h-2a5 5 0 0 1-5 5 5 5 0 0 1-5-5V6a5 5 0 0 1 10 0v6h-2V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z",
  pause: "M7 5h4v14H7V5Zm6 0h4v14h-4V5Z",
  play: "M8 5v14l11-7L8 5Z",
  remove:
    "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z",
  send:
    "M12 5 5.5 11.5l1.4 1.4 4.1-4.08V19h2V8.82l4.1 4.08 1.4-1.4L12 5Z",
  stop: "M7 7h10v10H7V7Z",
};

export function Icon({ name }: IconProps): ReactElement {
  return (
    <svg
      className="control-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
