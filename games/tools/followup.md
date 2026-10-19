# Follow-up prompt template

Used only when my own playtest finds a problem the agent's run left behind. Sent to a new fresh pi session in the
same folder (the files from the earlier session stay). Always this wording, with only the observed symptom filled in:

> Playtest report for the game in this folder (a human looked at the screenshots): <symptom>.
> Find the cause, fix it, test again with node ../tools/smoke.ts, and stop.
