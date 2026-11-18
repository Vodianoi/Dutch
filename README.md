# Dutch

![Dutch](https://upload.wikimedia.org/wikipedia/commons/c/c6/King_of_diamonds2.svg)

Le jeu Dutch se joue avec des cartes à jouer standards, sans les jokers. Il est recommandé de jouer avec deux paquets, soit 104 cartes.

Nombre de joueur: 2 à 10

Temps approximatif d'une partie: 30 minutes

## Jouer

Le jeu se joue dans le navigateur : https://vodianoi.github.io/Dutch/

* **En ligne** : chacun joue sur son appareil (téléphone, ordinateur…) et ne voit que ce que son joueur a le droit de voir. Un joueur crée la partie et partage le code (ou le lien) ; les autres le rejoignent, puis le créateur distribue les cartes.
* **Sur cet écran** : tout le monde joue sur le même appareil (« hot-seat »).

### Comment marche le jeu en ligne

Il n'y a pas de serveur de jeu : la partie tourne dans le navigateur de celui qui l'a créée (l'hôte), qui sert d'arbitre. Les appareils se connectent directement entre eux en WebRTC grâce à [PeerJS](https://peerjs.com) ; le serveur public gratuit de PeerJS sert uniquement à les mettre en relation.

* Chaque joueur ne reçoit que sa propre vue : les cartes face cachée sont envoyées sans leur valeur, la carte piochée n'est visible que par celui qui l'a piochée, et les cartes regardées (Dame, échange, variante) ne sont montrées qu'à leur propriétaire. Une erreur de jet est montrée à tous.
* L'hôte vérifie toutes les actions : un joueur ne peut jouer que pour lui-même.
* Un joueur qui recharge la page ou perd la connexion retrouve sa place (même onglet) ; s'il est déconnecté, la partie l'attend.
* L'hôte doit garder la page ouverte : s'il la ferme, la partie s'arrête pour tout le monde.
* Certains réseaux très restrictifs (réseaux d'entreprise, certains opérateurs mobiles) peuvent bloquer les connexions WebRTC directes.

Pour tester le mode en ligne sur un seul ordinateur, ajoutez `?transport=local` à l'URL et ouvrez la partie dans plusieurs onglets : les onglets communiquent entre eux sans réseau.

### Développement

```bash
npm install      # TypeScript
npm run build    # compile les fichiers .ts en .js (les .js sont versionnés pour GitHub Pages)
npm test         # tests du moteur de jeu (node --test)
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

Ajouter `?debug` à l'URL affiche une case « Tout voir » qui retourne toutes les cartes (seulement sur un même écran).

**Comment jouer à l'écran**

* Le joueur dont c'est le tour clique sur la pioche ou sur la pile de rejet, puis sur la carte de sa main à remplacer (ou sur « Jeter » pour défausser la carte piochée).
* À tout moment, n'importe quel joueur peut cliquer sur une de ses cartes pour la jeter si elle a la même valeur que la carte visible du rejet. En cas d'erreur : carte de pénalité, et plus de jet possible jusqu'à la fin du tour.
* Valet, Dame et As déclenchent leur effet pour le joueur qui s'en débarrasse (dans l'ordre où les cartes ont été jouées) ; l'effet peut être ignoré.
* Le tour se termine avec « Fin du tour » ou « Dutch ! », seulement après avoir joué et résolu les effets.
* Le joueur qui a dit « Dutch » est protégé : ses cartes ne peuvent pas être échangées par un Valet et il ne peut pas recevoir de carte d'un As.
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
