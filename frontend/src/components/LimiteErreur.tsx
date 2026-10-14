'use client';

/**
 * Isole une partie d'écran : si elle plante pendant l'affichage, seule cette
 * partie est remplacée par un message, au lieu que toute l'application tombe
 * sur l'écran noir « This page couldn't load » de Next.js.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; repli: ReactNode };
type State = { erreur: boolean };

export default class LimiteErreur extends Component<Props, State> {
    state: State = { erreur: false };

    static getDerivedStateFromError(): State {
        return { erreur: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[LimiteErreur]', error, info.componentStack);
    }

    render() {
        return this.state.erreur ? this.props.repli : this.props.children;
    }
}
