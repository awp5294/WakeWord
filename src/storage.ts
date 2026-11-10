import AsyncStorage from "@react-native-async-storage/async-storage";
import { State, upgradeState } from "./logic";

const KEY = "wakeword.state.v1";

export async function loadState(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return upgradeState(raw ? JSON.parse(raw) : null);
  } catch {
    return upgradeState(null);
  }
}

export async function saveState(state: State): Promise<void> {
  state.updatedAt = Date.now();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: progress for this session is kept in memory.
  }
}
