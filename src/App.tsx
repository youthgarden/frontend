import { useEffect, useState } from 'react';
import { emit, on } from './events';
import { PhaserGame } from './game/PhaserGame';
import { LectureModal } from './ui/LectureModal';

export default function App() {
    const [lectureOpen, setLectureOpen] = useState(false);

    useEffect(() => on('interact', (target) => {
        if (target === 'blackboard') setLectureOpen(true);
    }), []);

    useEffect(() => {
        emit('ui-modal', lectureOpen);
    }, [lectureOpen]);

    return (
        <>
            <PhaserGame />
            {lectureOpen && <LectureModal onClose={() => setLectureOpen(false)} />}
        </>
    );
}
