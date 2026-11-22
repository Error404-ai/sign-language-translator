// Trend gesture ids double as training labels for `collect.py --kind trends`.
export const TRENDS = {
  six_seven:    { emoji: "⚖️", name: "6-7",           how: "Both open hands, palms up, bounce them up and down in turn", motion: true },
  heart_hands:  { emoji: "🫶", name: "Heart hands",   how: "Two hands: index tips touch on top, thumb tips touch below" },
  muscle_heart: { emoji: "💪", name: "Muscle heart",  how: "Flex one arm (that hand droops down from above), curl the other hand up to touch its fingertips, thumb pointing at your bicep" },
  l_forehead:   { emoji: "🫵", name: "L on forehead", how: "Thumb + index make an L, hold it against your forehead" },
  clock_it:     { emoji: "👀", name: "Clock it",      how: "Point a straight index finger at your eye / temple, thumb tucked into your fist" },
  ok:           { emoji: "👌", name: "OK",            how: "Thumb and index tips touch, other three fingers up" },
  saranghae:    { emoji: "🫰", name: "Saranghae",     how: "Korean finger heart (사랑해 = I love you): bend your index finger and cross your thumb over it (or touch the tips), other fingers folded" },
  thumbs_up:    { emoji: "👍", name: "Thumbs up",     how: "Fist with thumb pointing up" },
  thumbs_down:  { emoji: "👎", name: "Thumbs down",   how: "Fist with thumb pointing down" },
  ily:          { emoji: "🤟", name: "I love you",    how: "Thumb, index and pinky out" },
  shaka:        { emoji: "🤙", name: "Shaka",         how: "Thumb and pinky out, middle three folded" },
  rock_on:      { emoji: "🤘", name: "Rock on",       how: "Index and pinky out, thumb folded" },
  peace:        { emoji: "✌️", name: "Peace",         how: "Index and middle fingers in a V" },
};

export const trendText = id => (TRENDS[id] ? `${TRENDS[id].emoji} ${TRENDS[id].name}` : id.replaceAll("_", " "));
