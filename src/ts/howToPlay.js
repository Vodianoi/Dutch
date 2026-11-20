import { t } from './i18n.js';
/**
 *  How to play, for the rules of this game: its end score, its penalty, its special cards, the look
 *  at the first cards when the variant is on. In the language of this device.
 */
export function howToPlay(settings) {
    const effects = settings.effects;
    const special = effects.length
        ? [
            t('Elles agissent quand on les jette sur la défausse, pas quand on les prend. On peut passer l\'effet.'),
            ...(effects.includes('JACK') ? [t('Valet : échangez deux cartes sur la table, les vôtres ou celles des autres, sans les regarder.')] : []),
            ...(effects.includes('QUEEN') ? [t('Dame : regardez une de vos cartes.')] : []),
            ...(effects.includes('ACE') ? [t('As : donnez une carte de la pioche au joueur de votre choix.')] : []),
        ]
        : [t('Aucune carte spéciale dans cette partie.')];
    return [
        {
            title: t('Le but'),
            lines: [
                t('Avoir le moins de points. La partie s\'arrête quand un joueur atteint {score} points : celui qui en a le moins gagne.', { score: settings.targetScore }),
                t('As = 1 point, 2 à 10 = leur valeur, Valet = 11, Dame = 12, Roi noir = 13, Roi rouge = 0.'),
                t('Vos cartes sont face cachée : retenez celles que vous voyez passer.'),
            ],
        },
        {
            title: t('Début de la ronde'),
            lines: [
                t('Chacun reçoit {cards} cartes, face cachée.', { cards: settings.cardsPerPlayer }),
                ...(settings.peekVariant ? [t('Chacun regarde ses 2 cartes du bas, une seule fois : retenez-les !')] : []),
            ],
        },
        {
            title: t('À votre tour'),
            lines: [
                t('Piochez une carte, ou prenez la carte visible de la défausse.'),
                t('Échangez-la avec une de vos cartes, qui part sur la défausse. Une carte piochée peut aussi être jetée directement.'),
                t('Puis « Finir mon tour », ou « Dutch ! » si vous pensez avoir le moins de points.'),
            ],
        },
        {
            title: t('Jeter une carte identique'),
            lines: [
                t('À tout moment, même hors de votre tour : si une de vos cartes a la même valeur que la carte visible de la défausse, faites-la glisser dessus. Une carte de moins !'),
                t('En cas d\'erreur : une carte de pénalité, et plus de jet jusqu\'à la fin du tour.'),
            ],
        },
        { title: t('Cartes spéciales'), lines: special },
        {
            title: t('« Dutch » et fin de la ronde'),
            lines: [
                t('Dire « Dutch » annonce la fin : chacun des autres joue un dernier tour. Celui qui a dit Dutch est protégé : on ne peut ni échanger ses cartes ni lui en donner.'),
                t('Puis toutes les cartes sont retournées, et chacun ajoute leurs points à son score.'),
                settings.dutchPenalty
                    ? t('Si celui qui a dit Dutch n\'a pas le moins de points, il prend {penalty} points de plus (à égalité, il est à l\'abri).', { penalty: settings.dutchPenalty })
                    : t('Dutch raté : pas de pénalité dans cette partie.'),
            ],
        },
    ];
}
