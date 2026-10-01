# Three locales with RTL from day one

French, English and Arabic ship together, and layout is written with CSS logical properties so Arabic right-to-left is not a retrofit later. Machine-generated translations are marked as needing native review, and no legal text reaches a document template until a human has approved it — the person who reviews Arabic is the developer, and the golden test asserts the layout rather than the wording. Retrofitting RTL across a shipped interface means revisiting every margin, every grid and every chart, which is why it is cheaper to start with it.
