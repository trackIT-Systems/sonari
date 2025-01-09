import { useKeyPressEvent } from "react-use";
import { KeyShortcut } from "@/hooks/utils/useKeyFilter";

export type ShortcutConfig = {
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    action: () => void;
    href?: string;
}

export function useSpecialKeyShortcuts(shortcuts: ShortcutConfig[]) {
    useKeyPressEvent(
        (event) => {
            // Find the matching shortcut
            const shortcut = shortcuts.find(({ key, shiftKey, ctrlKey, altKey, metaKey }) => {
                if (event.key !== key) return false;

                // Only check special keys if they are explicitly defined in the config
                if (shiftKey !== undefined && event.shiftKey !== shiftKey) return false;
                if (ctrlKey !== undefined && event.ctrlKey !== ctrlKey) return false;
                if (altKey !== undefined && event.altKey !== altKey) return false;
                if (metaKey !== undefined && event.metaKey !== metaKey) return false;

                return true;
            });

            if (shortcut) {
                event.preventDefault();
                event.stopPropagation();
                shortcut.action();
                return true;
            }

            return false;
        }
    );
}

export const getMetaKeyLabel = () => {
    const isMacOS = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return isMacOS ? '⌘' : 'Ctrl';
};

export const getSpecialKeyLabel = (key: string) => {
    switch (key) {
        case "ArrowRight":
            return "→"
        case "ArrowDown":
            return "↓"
        case "ArrowLeft":
            return "←"
        case "ArrowUp":
            return "↑"
        case "Enter":
            return "⏎"
        case "Shift":
            return "⇧"
        default:
            return key
    }
};

// Root level shortcuts
export const GO_DATASETS_SHORTCUT = "1";
export const GO_PROJECTS_SHORTCUT = "2";
export const GO_PROFILE_SHORTCUT = "9";
export const LOGOUT_SHORTCUT = "0";

// Shortcuts for Task Annotation
export const ACCEPT_TASK_SHORTCUT = "1";
export const UNSURE_TASK_SHORTCUT = "2";
export const REJECT_TASK_SHORTCUT = "3";
export const VERIFY_TASK_SHORTCUT = "4";

export const CREATE_SOUND_EVENT_SHORTCUT = "c";
export const SELECT_SOUND_EVENT_SHORTCUT = "s";
export const DELETE_SOUND_EVENT_SHORTCUT = "x";

export const ADD_TAG_SHORTCUT = "a";
export const REPLACE_TAG_SHORTCUT = "r";
export const DELETE_TAG_SHORTCUT = "d";

export const HELP_SHORTCUT = "?";

export const NEXT_SOUND_EVENT_SHORTCUT = "n";
export const PREVIOUS_SOUND_EVENT_SHORTCUT = "b";
export const SOUND_EVENT_CYCLE_FILTER_SHORTCUT = "m";

export const NEXT_TASK_SHORTCUT = "ArrowRight";
export const PREV_TASK_SHORTCUT = "ArrowLeft";

export const LOCK_ASPECT_RATIO_SHORTCUT = "l";
export const ZOOM_SHORTCUT = "z";
export const ZOOM_IN_SHORTCUT = "+";
export const ZOOM_OUT_SHORTCUT = "-";
export const RESET_ZOOM_SHORTCUT = "u";

export const MOVE_LEFT_SHORTCUT = "ArrowLeft";
export const MOVE_RIGHT_SHORTCUT = "ArrowRight";
export const MOVE_UP_SHORTCUT = "ArrowUp";
export const MOVE_DOWN_SHORTCUT = "ArrowDown";

export const PLAY_SHORTCUT = " ";

export const FILTER_SHORTCUT = "f";
export const DISABLE_SPECTROGRAM_SHORTCUT = "h";
export const GEOMETRY_TYPE_SHORTCUT = "e";
export const SETTINGS_SHORTCUT = "o";
export const CLIP_NOTE_SHORTCUT = "q";
export const SUBMIT_CLIP_NOTE_SHORTCUT = "Enter";

// General shortcuts
export const ABORT_SHORTCUT = "Escape";
export const ACCEPT_SHORTCUT = "Enter";

// List and Overview movement
export const LIST_ELEMENT_UP_SHORTCUT = "ArrowUp";
export const LIST_ELEMENT_DOWN_SHORTCUT = "ArrowDown";
export const SELECT_LIST_ELEMENT_SHORTCUT = "Enter";
export const LIST_OVERVIEW_DOWN_SHORTCUT = "ArrowDown";
export const SEARCH_BAR_LEAVE_SHORTCUT = "ArrowDown";
export const SELECT_FST_ELEMENT_SHORTCUT = "1";
export const SELECT_SND_ELEMENT_SHORTCUT = "2";
export const SELECT_TRD_ELEMENT_SHORTCUT = "3";
export const SELECT_FRT_ELEMENT_SHORTCUT = "4";
export const NAVIGATE_FST_ELEMENT_SHORTCUT = "5";
export const NAVIGATE_SND_ELEMENT_SHORTCUT = "6";
export const NAVIGATE_TRD_ELEMENT_SHORTCUT = "7";
export const NAVIGATE_FOT_ELEMENT_SHORTCUT = "8";
export const NAVIGATE_FTH_ELEMENT_SHORTCUT = "9";
export const NAVIGATE_STH_ELEMENT_SHORTCUT = "0";
export const FILTER_POPOVER_SHORTCUT = "f";

export const ROOT_NAVIGATION_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Open Datasets",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getMetaKeyLabel()} ${GO_DATASETS_SHORTCUT}`,
        description: "Go to dataset overview",
    },
    {
        label: "Open Projects",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getMetaKeyLabel()} ${GO_PROJECTS_SHORTCUT}`,
        description: "Go to annotation project overview",
    },
    {
        label: "Open Profile",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getMetaKeyLabel()} ${GO_PROFILE_SHORTCUT}`,
        description: "Go to user profile page",
    },
    {
        label: "Logout",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getMetaKeyLabel()} ${LOGOUT_SHORTCUT}`,
        description: "Logout",
    },
]

export const MISC_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Help",
        shortcut: HELP_SHORTCUT,
        description: "Open this help panel",
    },
    {
        label: "Play",
        shortcut: PLAY_SHORTCUT,
        description: "Start and stop audio playback",
    },
    {
        label: "Filter",
        shortcut: FILTER_SHORTCUT,
        description: "Open filter panel",
    },
    {
        label: "Settings",
        shortcut: SETTINGS_SHORTCUT,
        description: "Open the settings panel",
    },
    {
        label: "New Clip Note",
        shortcut: CLIP_NOTE_SHORTCUT,
        description: "Add a new note to clips",
    },
    {
        label: "Sbumit Clip Note",
        shortcut: `${getSpecialKeyLabel("Shift")} ${SUBMIT_CLIP_NOTE_SHORTCUT}`,
        description: "Submit a new note when done writing",
    },
    {
        label: "Submit Clip Issue",
        shortcut: `${getMetaKeyLabel()} ${SUBMIT_CLIP_NOTE_SHORTCUT}`,
        description: "Submit a new issue when done writing",
    },
]

export const TASK_STATE_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Accept",
        shortcut: ACCEPT_TASK_SHORTCUT,
        description: "Mark task as accepted",
    },
    {
        label: "Unsure",
        shortcut: UNSURE_TASK_SHORTCUT,
        description: "Mark task as unsure",
    },
    {
        label: "Reject",
        shortcut: REJECT_TASK_SHORTCUT,
        description: "Mark task as rejected",
    },
    {
        label: "Verify",
        shortcut: VERIFY_TASK_SHORTCUT,
        description: "Mark task as verified",
    },
    {
        label: "Next",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getSpecialKeyLabel(NEXT_TASK_SHORTCUT)}`,
        description: "Go to next task",
    },
    {
        label: "Previous",
        shortcut: `${getSpecialKeyLabel("Shift")} ${getSpecialKeyLabel(PREV_TASK_SHORTCUT)}`,
        description: "Go to previous task",
    },
]

export const SPECTROGRAM_KEY_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Disable spectrogram",
        shortcut: DISABLE_SPECTROGRAM_SHORTCUT,
        description: "Do not show spectrograms",
    },
    {
        label: "Fix aspect ratio",
        shortcut: LOCK_ASPECT_RATIO_SHORTCUT,
        description: "Toggle fixed aspect ratio for zoom",
    },
    {
        label: "Zoom to selection",
        shortcut: ZOOM_SHORTCUT,
        description: "Zoom into a selection of the spectrogram",
    },


    {
        label: "Zoom in time",
        shortcut: ZOOM_IN_SHORTCUT,
        description: "Zoom in on time axis",
    },
    {
        label: "Zoom out time",
        shortcut: ZOOM_OUT_SHORTCUT,
        description: "Zoom out on frequency axis",
    },

    {
        label: "Zoom in frequency",
        shortcut: `${getSpecialKeyLabel("Shift")} ${ZOOM_IN_SHORTCUT}`,
        description: "Zoom in on time axis",
    },
    {
        label: "Zoom out frequency",
        shortcut: `${getSpecialKeyLabel("Shift")} ${ZOOM_OUT_SHORTCUT}`,
        description: "Zoom out on frequency axis",
    },
    {
        label: "Reset Zoom",
        shortcut: RESET_ZOOM_SHORTCUT,
        description: "Zoom to original settings",
    },
];

export const SPECTRGRAM_NAVIGATION_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Move time axis left",
        shortcut: `${getSpecialKeyLabel(MOVE_LEFT_SHORTCUT)}`,
        description: "Move to the left",
    },
    {
        label: "Move time axis right",
        shortcut: `${getSpecialKeyLabel(MOVE_RIGHT_SHORTCUT)}`,
        description: "Move to the right",
    },
    {
        label: "Move frequency axis up",
        shortcut: `${getSpecialKeyLabel(MOVE_UP_SHORTCUT)}`,
        description: "Move up",
    },
    {
        label: "Move frequency axis down",
        shortcut: `${getSpecialKeyLabel(MOVE_DOWN_SHORTCUT)}`,
        description: "Move down",
    },
    {
        label: "Next Sound Event",
        shortcut: NEXT_SOUND_EVENT_SHORTCUT,
        description: "Select the next sound event",
    },
    {
        label: "Previous Sound Event",
        shortcut: PREVIOUS_SOUND_EVENT_SHORTCUT,
        description: "Select the previous sound event",
    },
    {
        label: "Sound event navigation",
        shortcut: SOUND_EVENT_CYCLE_FILTER_SHORTCUT,
        description: "Set or remove tag for next and previous sound event navigation",
    },
]

export const ANNOTATION_KEY_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Add Annotation",
        shortcut: CREATE_SOUND_EVENT_SHORTCUT,
        description: "Add a new annotation",
    },
    {
        label: "Select Annotation",
        shortcut: SELECT_SOUND_EVENT_SHORTCUT,
        description: "Select an annotation",
    },
    {
        label: "Delete Annotation",
        shortcut: DELETE_SOUND_EVENT_SHORTCUT,
        description: "Delete an annotation",
    },
    {
        label: "Select Geometry",
        shortcut: GEOMETRY_TYPE_SHORTCUT,
        description: "Open geometry type selection",
    },
]

export const NAVIGATION_KEY_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Select next",
        shortcut: NEXT_SOUND_EVENT_SHORTCUT,
        description: "Select next sound event annotation",
    },
    {
        label: "Select previous",
        shortcut: PREVIOUS_SOUND_EVENT_SHORTCUT,
        description: "Select previous sound event annotation",
    },
    {
        label: "Delete tags",
        shortcut: DELETE_TAG_SHORTCUT,
        description: "Delete a tag from all sound events",
    },
    {
        label: "Cycle filter",
        shortcut: SOUND_EVENT_CYCLE_FILTER_SHORTCUT,
        description: "Set or remove tag that will be used for selecting next or previous sound event",
    },
];

export const AUDIO_KEY_SHORTCUTS: KeyShortcut[] = [
    {
        label: "Play/Pause",
        shortcut: PLAY_SHORTCUT,
        description: "Play or pause the audio",
    },
];
