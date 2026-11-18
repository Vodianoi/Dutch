# Dutch

![Dutch](https://upload.wikimedia.org/wikipedia/commons/c/c6/King_of_diamonds2.svg)

Le jeu Dutch se joue avec des cartes à jouer standards, sans les jokers. Il est recommandé de jouer avec deux paquets, soit 104 cartes.

Nombre de joueur: 2 à 10

Temps approximatif d'une partie: 30 minutes

## Jouer

Le jeu se joue dans le navigateur : https://vodianoi.github.io/Dutch/

Version de test (branche `dev`, nouveautés pas encore publiées) : https://vodianoi.github.io/Dutch/dev/. Ses parties et ses réglages sont séparés de ceux du vrai site ; tous les joueurs d'une partie doivent utiliser la même version.

* **Contre l'ordinateur** : vous jouez contre 1 à 9 adversaires de l'ordinateur. Ils ne voient pas vos cartes et ne retiennent que celles qu'on leur a montrées. La partie est enregistrée à chaque coup : l'accueil propose de la reprendre.
* **En ligne** : chacun joue sur son appareil (téléphone, ordinateur…) et ne voit que ce que son joueur a le droit de voir. Un joueur crée la partie et partage le code (ou le lien) ; les autres le rejoignent, puis le créateur distribue les cartes.
* **Sur cet écran** : tout le monde joue sur le même appareil (« hot-seat »). Réservé aux tests : proposé sur la version de test et en développement (localhost), pas sur le vrai site.

### Comment marche le jeu en ligne

Il n'y a pas de serveur de jeu : la partie tourne dans le navigateur de celui qui l'a créée (l'hôte), qui sert d'arbitre. Les appareils se connectent directement entre eux en WebRTC grâce à [PeerJS](https://peerjs.com) ; le serveur public gratuit de PeerJS sert uniquement à les mettre en relation.

* Chaque joueur ne reçoit que sa propre vue : les cartes face cachée sont envoyées sans leur valeur, la carte piochée n'est visible que par celui qui l'a piochée, et les cartes regardées (Dame, échange, variante) ne sont montrées qu'à leur propriétaire. Une erreur de jet est montrée à tous.
* L'hôte vérifie toutes les actions : un joueur ne peut jouer que pour lui-même.
* Un joueur qui perd la connexion, quitte l'application ou recharge la page se reconnecte tout seul et retrouve sa place et ses cartes ; en attendant, la partie l'attend.
* La partie est sauvegardée sur l'appareil de l'hôte : s'il quitte l'application ou ferme la page, elle reprend quand il revient (rechargement ou « Reprendre la partie » sur l'accueil), et les autres joueurs se reconnectent tout seuls.
* Certains réseaux très restrictifs (réseaux d'entreprise, certains opérateurs mobiles) peuvent bloquer les connexions WebRTC directes.

Pour tester le mode en ligne sur un seul ordinateur, ajoutez `?transport=local` à l'URL et ouvrez la partie dans plusieurs onglets : les onglets communiquent entre eux sans réseau.

### Développement

```bash
npm install      # TypeScript
npm run build    # compile les fichiers .ts en .js (les .js sont versionnés pour GitHub Pages)
npm test         # tests du moteur de jeu (node --test)
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

### Publication

Le site est publié par GitHub Actions (`.github/workflows/pages.yml`) à chaque push sur `main` ou `dev` : `main` à la racine, `dev` sous `/dev/`.

* Les nouveautés sont fusionnées dans `dev` et testées sur https://vodianoi.github.io/Dutch/dev/.
* Quand elles sont prêtes, `dev` est fusionnée dans `main` pour les publier.

La table de jeu est dessinée avec [PixiJS](https://pixijs.com) (WebGL) et animée avec [GSAP](https://gsap.com), chargés depuis un CDN (versions fixées dans `index.html`) ; les paquets npm ne servent qu'aux types. Code de la table : `src/ts/table/`. Ajouter `?classic` à l'URL affiche l'ancien écran de jeu (HTML), et `?debug` ajoute au menu une case « Voir toutes les cartes » (sans le jeu en ligne côté joueur).

**Comment jouer à l'écran**

* Le joueur dont c'est le tour touche la pioche ou la pile de rejet, puis la carte de sa main à remplacer (ou la pile de rejet pour jeter la carte piochée). On peut aussi faire glisser la carte piochée sur une de ses cartes ou sur la pile de rejet.
* À tout moment, même pendant que les joueurs regardent leurs premières cartes, un joueur peut jeter une de ses cartes si elle a la même valeur que la carte visible du rejet : en la faisant glisser sur la pile de rejet, ou en la touchant puis en appuyant sur « Jeter sur la défausse ». En cas d'erreur : carte de pénalité, et plus de jet possible jusqu'à la fin du tour.
* Le bouton « Menu » donne les règles de la partie, les réglages de l'appareil (sons, vibrations, animations rapides, dos des cartes) et permet de quitter la partie.
* Valet, Dame et As déclenchent leur effet pour le joueur qui s'en débarrasse (dans l'ordre où les cartes ont été jouées) ; l'effet peut être ignoré.
* Le tour se termine avec « Finir mon tour » ou « Dutch ! » (à confirmer d'une deuxième pression), seulement après avoir joué et résolu les effets.
* Le joueur qui a dit « Dutch » est protégé : ses cartes ne peuvent pas être échangées par un Valet et il ne peut pas recevoir de carte d'un As.
* Les joueurs sont assis autour de la table : soi-même en bas (le premier joueur sur un écran partagé), les autres dans le sens des aiguilles d'une montre, dans l'ordre du jeu. Les places ne bougent pas pendant la partie. Sur téléphone tenu droit, les autres joueurs sont sur une ou deux rangées au-dessus du milieu de la table.
* Les cartes de chaque joueur sont posées en carré (2 rangées) et gardent leur place : une carte jetée laisse un emplacement vide, pour se souvenir de la position de ses cartes. Une carte reçue (pénalité, As) prend le premier emplacement vide.
* Quand la pioche est vide, la pile de rejet (sauf la carte visible) est mélangée pour refaire la pioche.
* Variante optionnelle au lancement : chacun regarde ses 2 dernières cartes en début de ronde.
* Règles réglables avant de distribuer (sur cet écran, ou par l'hôte dans la salle d'attente, visibles par tous) : nombre de cartes par joueur (3 à 6), 1 ou 2 paquets, score de fin de partie (50 à 200), pénalité d'un « Dutch » raté (0 à 20), et Valet, Dame ou As actifs ou non.
* Chaque joueur choisit sa couleur (en ligne, si elle est déjà prise, l'hôte lui en donne une autre).

## But du jeu

Le but du jeu est d'avoir le moins de point possible dans sa main. Chaque carte que l'on détient vaut le nombre de point égale à sa valeur (As = 1, Valet = 11, etc.). Les points sont comptabilisé à chaque ronde. Lorsqu'un joueur atteint 100 points, la partie est terminée et le joueur avec le moins de point gagne.

## Structure d'une ronde

Au début de la ronde, chaque joueur reçoit 4 cartes qu'ils ne doivent pas regarder, sinon une carte de pénalité sera donné pour chaque carte regardée à la personne dans l'erreur. 

Lorsque les cartes sont distribuées, 2 piles de cartes sont placé au centre de la table. La pioche, face en bas (facedown), qui contient la totalité des cartes restantes. Ensuite, une carte du dessus de la pile est placé face en haut (faceup) à côté de la pioche. Ce sera la pile de rejet.

Le déroulement d'une ronde suit le sens des aiguilles d'une montre. Ainsi, à son tour, chaque joueur décide s'il pige de la pioche ou de la pile de rejet face up. (Le but est de piger les plus petites cartes...)

Lorsqu'il pige, le joueur décide quel carte il échange dans son jeu afin de connaître une de ses cartes. Si le joueur pige dans la pile de rejet, il se doit d'échanger une de ses cartes.

Lorsque le joueur a décidé s'il échangeait ou non sa carte, il la place dans la pile de rejet.

C'est à ce moment qu'un joueur qui a le même chiffre dans ses cartes peut joueur sa carte lui aussi et ainsi se débarrasser d'une de ses cartes. Les joueurs peuvent faire cette action à n'importe quel moment où la carte est mise dans la pile de rejet.

Si un joueur se trompe (exemple, le joueur A joue un 5, mais le joueur C pense qu'il a aussi un 5 dans sa main, mais joue un 8) il a une carte de pénalit. Un joueur ne peut pas rejouer d'autre carte durant ce tour.

Une une ronde se termine lorsqu'un joueur, à la fin de son tour, dit le mot "Dutch". Alors, chaque joueur doit jouer un dernier tour. Lors de ce dernier tour, le joueur qui a dit "Dutch" a l'immunité et ne peut pas se faire échanger de carte. Cependant, il peut jeter des cartes qu'il connaît lors du dernier tour de chaque joueur. À condition que ce soit le même chiffre, bien sûr.

## Cartes spéciales

Si un joueur se débarrasse d'une carte spéciale, une action peut être fait. Si plusieurs joueurs jouent une carte spéciale, les actions sont fait dans l'ordre que les joueurs ont joués.

### Valet
Si un valet est joué, le joueur qui se débarrasse de sa carte peut échanger deux cartes sur la table, peu importe les joueurs. Ainsi, un joueur peut échanger entre lui et un autre joueur, des cartes du même joueur, ou deux joueurs de son choix.

### Dame
La dame permet de regarder une de ses cartes sans pénalité.

### As
Le joueur qui joue cette carte peut donner une carte de la pioche au joueur de son choix.

### Roi
Les rois ROUGES ne valent aucun points et les rois NOIRS, 13.

## Fin de partie et comptage des points

À chaque fin de ronde, on comptabilise les points. Un joueur qui dit "Dutch" et qui n'obtient pas le pointage le plus bas a une pénalité de 10 points. En cas d'égalité, le joueur qui a dit "Dutch" a l'avantage.

Il est recommandé d'utiliser l'application [scorekeepr](http://scorekeepr.net) pour comptabiliser les points. [shameless plug](https://github.com/allov/scorekeepr) :-)

## Stratégies et astuces

* Lorsqu'un qui échange la même carte dans son jeu (exemple, il pige un 5 de coeur, et échange avec un 5 de trèfle), il peut jeter son 5 de coeur en même temps.
* Il est conseillé de remplacer ses cartes en début de partie et ce même si cette carte a une grande valeure; c'est toujours mieux de connaître ses cartes.
* De la même façon, garder une Dame lors des premiers tour peut permettre d'accélérer la connaissance de ses cartes.
* En tout temps un joueur peut déplacer ses cartes dans son jeu afin de protéger ses cartes des joueurs scrupuleux ;)
* Jouer avec deux jeux de cartes qui ont un dos de la même couleur afin d'éviter que les autres joueurs connaissent l'emplacement de vos carte dans votre jeu.
* De la même façon, jouer avec deux jeux de carte qui ont un dos de différente couleur afin d'augmenter le vole de carte ;)
* Un joueur peu se retrouver avec aucune carte, mais doit attendre la fin de son tour avant de dire "Dutch".
* Les cartes sont toujours jouées dans l'ordre. Ainsi, si un roi NOIR est joué après un roi ROUGE, le roi NOIR a précéance lors de la phase de pige (le roi rouge est ainsi bloqué).
