# 2K27 typography and palette correction

Reference inspected in-browser: https://nba.2k.com/2k27/ on November 4, 2026.

Measured reference styles: primary CTA RGB(255,0,0), white CTA text; black navigation; Sharp Grotesk Variable bold italic major headings; RecklessNeue navigation/CTA typography. The prior gold/Barlow styling did not match these requirements.

Changes: removed gold and warm-neutral brand colors; pure-red buttons, selected availability cells, focus accents and active tabs; black/charcoal surfaces and white text; subtle dark-red entry background. Replaced Barlow with self-hosted Roboto Flex (heavy slanted headings) and Source Serif 4 Italic (navigation/buttons). Both are SIL OFL fonts obtained from google/fonts; licenses accompany the files. Roboto Flex axes allow matching weight/width/slant more closely than the previous condensed Barlow. These are substitutes, not the proprietary reference fonts. Exact font identity remains unmet without licensed Sharp Grotesk Variable and Reckless Neue files.

GitHub evaluated: https://github.com/googlefonts/roboto-flex and https://github.com/google/fonts. Hugging Face evaluated: https://huggingface.co/ClosedBrain/FontDNA-V2 and https://huggingface.co/spaces/tfrere/font-map. Recognition models were not needed because reference computed styles identify the fonts directly.

Browser verification: desktop starting screen renders the intended heavy italic sans-serif headline and italic serif CTA; computed CTA background is rgb(255, 0, 0). No scheduling, authentication, schema, or stored record changes are part of this correction.
