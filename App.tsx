import React, { useState, useEffect } from 'react';
import { Game } from './components/Game.tsx';
import { Lobby } from './components/Lobby.tsx';

type ViewState = 'lobby' | 'pve' | 'pvp';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('lobby');
  const [initialGameId, setInitialGameId] = useState<string | null>(null);

  useEffect(() => {
    // Check for Telegram Start Param (Deep Linking)
    // Format: t.me/bot/app?startapp=game_ID
    // @ts-ignore
    const initData = window.Telegram?.WebApp?.initDataUnsafe;
    
    if (initData?.start_param) {
      const startParam = initData.start_param;
      // Assume simple ID first, or prefix parsing if needed.
      // E.g. start_param: "game_12345"
      if (startParam.startsWith('game_')) {
          const gameId = startParam.replace('game_', '');
          console.log("Found Game Invite ID:", gameId);
          setInitialGameId(gameId);
          setView('pvp');
      }
    }
  }, []);

  const handleStartGame = (mode: 'pve' | 'pvp') => {
    setView(mode);
  };

  const handleBackToLobby = () => {
    setView('lobby');
    setInitialGameId(null);
  };

  return (
    <>
      {view === 'lobby' && <Lobby onStartGame={handleStartGame} />}
      {(view === 'pve' || view === 'pvp') && (
        <Game 
          mode={view} 
          onBack={handleBackToLobby}
          invitedGameId={initialGameId}
        />
      )}
    </>
  );
};

export default App;