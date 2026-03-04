export interface Store<T> {
    getState(): T;
    setState(partial: Partial<T>): T;
    subscribe(listener: (state: T) => void): () => void;
}

export function createStore<T extends object>(initialState: T): Store<T> {
    let state = initialState;
    const listeners = new Set<(state: T) => void>();

    return {
        getState() {
            return state;
        },
        setState(partial) {
            state = { ...state, ...partial };
            listeners.forEach((listener) => listener(state));
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
