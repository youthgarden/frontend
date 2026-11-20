import { useEffect, useState } from 'react';
import { emit, on, type GameEvents } from './events';
import { PhaserGame } from './game/PhaserGame';
import { PanelPlaceholder } from './ui/PanelPlaceholder';

type Panel = GameEvents['interact'][0];
const TITLES: Record<Panel, string> = { lectures: '강의 목록', exam: '시험 패널' };

export default function App() {
    const [panel, setPanel] = useState<Panel | null>(null);

    useEffect(() => on('interact', setPanel), []);

    useEffect(() => {
        emit('ui-modal', panel !== null);
    }, [panel]);

    return (
        <>
            <PhaserGame />
            {panel && <PanelPlaceholder title={TITLES[panel]} onClose={() => setPanel(null)} />}
        </>
    );
}
