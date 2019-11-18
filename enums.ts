enum GameState {
    INTIALIZING,
    DAY_INTRO, 
    DAY_DISCUSSION,
    DAY_VOTE,
    DAY_TRIAL_STATEMENT,
    DAY_TRIAL_DECISION,
    NIGHT,
    DAY_ANNOUNCEMENTS
};

enum GameRole {
    MAFIA,
    HEALER,
    DETECTIVE,
    TOWNSPERSON
}

export { GameState, GameRole };