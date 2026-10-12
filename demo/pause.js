// Maestro has no sleep command. Block the flow for MS milliseconds.
var until = Date.now() + parseInt(MS, 10)
while (Date.now() < until) {}
