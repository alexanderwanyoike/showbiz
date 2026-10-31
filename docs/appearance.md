# Appearance

Open Settings, then Appearance. Choose a material, light/dark/system mode and an accent independently. Showbiz native preserves the original surfaces and Showbiz blue remains the default accent. Choices persist on the current device and apply on startup.

The material vocabulary follows Auto Digger's existing appearance controls. The aluminium surface values and cobalt, sage, copper, plum and amber accent pairs follow Forgecut's `src/themes.css` on dev, with light and dark colours selected separately for contrast. These are local MIT-licensed project patterns; no additional UI framework or theme dependency is introduced.

The original quick theme toggle remains available in the header. Invalid saved preferences fall back to Showbiz native; storage failures are reported in Appearance instead of claiming the new preference was saved.
