import { useKeyPressEvent } from "react-use";

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

export const ACCEPT_TASK_SHORTCUT = "a";
export const CREATE_SOUND_EVENT_SHORTCUT = "c";
export const DELETE_SOUND_EVENT_SHORTCUT = "d";
export const ADD_TAG_SHORTCUT = "f";
export const HELP_SHORTCUT = "h";
export const PREVIOUS_SOUND_EVENT_SHORTCUT = "j";
export const NEXT_SOUND_EVENT_SHORTCUT = "k";
export const LOCK_ASPECT_RATIO_SHORTCUT = "l";
export const SOUND_EVENT_CYCLE_FILTER_SHORTCUT = "m";
export const NEXT_TASK_SHORTCUT = "n";
export const PREV_TASK_SHORTCUT = "p";
export const REJECT_TASK_SHORTCUT = "r";
export const SELECT_SOUND_EVENT_SHORTCUT = "s";
export const REPLACE_TAG_SHORTCUT = "t";
export const UNSURE_TASK_SHORTCUT = "u";
export const VERIFY_TASK_SHORTCUT = "v";
export const DELETE_TAG_SHORTCUT = "y";
export const ZOOM_SHORTCUT = "z";
export const ZOOM_IN_SHORTCUT = "+";
export const ZOOM_OUT_SHORTCUT = "-";
export const MOVE_LEFT_SHORTCUT = "ArrowLeft";
export const MOVE_RIGHT_SHORTCUT = "ArrowRight";
export const GO_DATASETS_SHORTCUT = "1";
export const GO_PROJECTS_SHORTCUT = "2";
export const GO_PROFILE_SHORTCUT = "9";
export const LOGOUT_SHORTCUT = "0";
export const ABORT_SHORTCUT = "Escape";
export const ACCEPT_SHORTCUT = "Enter";
export const PLAY_SHORTCUT = " ";
export const LIST_ELEMENT_UP_SHORTCUT = "ArrowUp";
export const LIST_ELEMENT_DOWN_SHORTCUT = "ArrowDown";
export const SELECT_LIST_ELEMENT_SHORTCUT = "Enter";
export const LIST_OVERVIEW_DOWN_SHORTCUT = "ArrowDown";
export const SEARCH_BAR_LEAVE_SHORTCUT = "ArrowDown";
export const SELECT_FST_ELEMENT_SHORTCUT = "1";
export const SELECT_SND_ELEMENT_SHORTCUT = "2";
export const SELECT_TRD_ELEMENT_SHORTCUT = "3";
export const SELECT_FRT_ELEMENT_SHORTCUT = "4";
export const SELECT_FTH_ELEMENT_SHORTCUT = "5";
export const SELECT_STH_ELEMENT_SHORTCUT = "6";
export const SELECT_SVNTH_ELEMENT_SHORTCUT = "7";
export const SELECT_ETH_ELEMENT_SHORTCUT = "8";
export const SELECT_NTH_ELEMENT_SHORTCUT = "9";
