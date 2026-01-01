# Analyse du Mécanisme d'Attribution de Compétences

## Vue d'ensemble

Le système d'attribution de compétences (skills) est un mécanisme central qui permet de débloquer progressivement des compétences aux utilisateurs en fonction de leur performance dans les leçons. Ce document analyse en détail le fonctionnement de ce mécanisme.

## Architecture du Système

### 1. Modèle de Données

#### Tables de Base de Données

**`user_skill_state`** (table publique)
- `id`: UUID unique
- `skill_key`: Clé unique de la compétence (TEXT, UNIQUE)
- `unlocked`: Boolean indiquant si la compétence est débloquée
- `mastery`: Niveau de maîtrise (0-100)
- `last_practiced_at`: Date de dernière pratique
- `local_user_id`: Référence optionnelle à l'utilisateur local
- `created_at`, `updated_at`: Timestamps

**`curriculum_nodes`** (schéma curriculum)
- Stocke les définitions des compétences dans le curriculum
- `node_type = 'skill'`: Identifie les nœuds de compétence
- `data.label`: Titre de la compétence
- `data.description`: Description optionnelle

**`curriculum_edges`** (schéma curriculum)
- `edge_type = 'lesson_awards_skill'`: Lien entre une leçon et une compétence qu'elle peut débloquer
- `edge_type = 'lesson_requires_skill'`: Lien entre une leçon et une compétence requise

#### Structure du Curriculum

Les compétences sont définies dans le graph de curriculum avec deux types de relations :

1. **`lesson_awards_skill`** : Une leçon peut débloquer une ou plusieurs compétences
2. **`lesson_requires_skill`** : Une leçon peut nécessiter une ou plusieurs compétences débloquées

### 2. Flux d'Attribution

#### Phase 1 : Démarrage de la Leçon (`lesson-start`)

**Fichier**: `supabase/functions/lesson-start/index.ts`

1. **Récupération des compétences attribuables** :
   ```typescript
   // Ligne 134-164
   // Récupère les edges de type "lesson_awards_skill"
   const awardedSkills: string[] = [];
   for (const edge of edges || []) {
     if (edge.source_key === lessonKey) {
       if (edge.edge_type === "lesson_awards_skill") {
         awardedSkills.push(edge.target_key);
       }
     }
   }
   ```

2. **Compilation du Lesson Brief** :
   - Les compétences attribuables sont incluses dans `lessonBrief.awardedSkills`
   - Ce brief est stocké dans `lesson_runs.lesson_brief` pour référence ultérieure

3. **Affichage initial** :
   - Le frontend récupère le statut de déblocage via `fetchSkillStatus()`
   - Affiche la compétence à débloquer dans l'interface utilisateur

#### Phase 2 : Évaluation de la Performance (`lesson-evaluate`)

**Fichier**: `supabase/functions/lesson-evaluate/index.ts` (non montré mais référencé)

- Évalue la performance de l'utilisateur
- Retourne une évaluation : `"pass"`, `"close"`, ou `"fail"`
- Cette évaluation est utilisée par le coach pour décider de l'attribution

#### Phase 3 : Décision du Coach (`lesson-decide`)

**Fichier**: `supabase/functions/lesson-decide/index.ts`

C'est ici que se fait l'attribution effective des compétences.

**Étapes du processus** :

1. **Mise à jour des streaks** (lignes 107-115) :
   ```typescript
   const newState: LessonState = {
     turn: currentState.turn + 1,
     passStreak: graderOutput.evaluation === "pass" ? currentState.passStreak + 1 : 0,
     failStreak: graderOutput.evaluation === "fail" ? currentState.failStreak + 1 : 
                 graderOutput.evaluation === "close" ? currentState.failStreak + 1 : 0,
     // ...
   };
   ```

2. **Application des garde-fous** (lignes 117-130) :
   - `PASS_STREAK_THRESHOLD = 2` : Après 2 passes consécutifs, suggère de rendre plus difficile ou de sortir
   - `FAIL_STREAK_THRESHOLD = 3` : Après 3 échecs consécutifs, suggère de rendre plus facile
   - `MAX_ATTEMPTS = 5` : Après 5 tentatives, suggère une pause

3. **Décision du LLM Coach** (lignes 196-295) :
   - Le coach LLM reçoit le contexte complet
   - Peut décider d'attribuer les compétences via le paramètre `awardSkills`
   - Le prompt indique : "Whether to award the lesson's skills based on demonstrated mastery (true if passStreak >= 2)"

4. **Condition d'attribution** (lignes 297-301) :
   ```typescript
   const shouldAwardSkills = coachOutput.awardSkills || (
     newState.passStreak >= PASS_STREAK_THRESHOLD &&
     (coachOutput.nextAction === "EXIT_TO_MAIN_TEACHER" || coachOutput.nextAction === "MAKE_HARDER")
   );
   ```

   **Conditions pour attribution** :
   - Le coach LLM décide explicitement (`coachOutput.awardSkills === true`)
   - **OU** :
     - Pass streak >= 2 (2 passes consécutifs)
     - **ET** l'action suivante est soit `EXIT_TO_MAIN_TEACHER` soit `MAKE_HARDER`

5. **Attribution effective** (lignes 303-327) :
   ```typescript
   if (shouldAwardSkills && awardedSkills.length > 0) {
     for (const skillKey of awardedSkills) {
       await supabase
         .from("user_skill_state")
         .upsert({
           skill_key: skillKey,
           unlocked: true,
           mastery: 1,
           last_practiced_at: new Date().toISOString(),
         }, { onConflict: "skill_key" });
     }
   }
   ```

   **Propriétés attribuées** :
   - `unlocked: true` : La compétence est débloquée
   - `mastery: 1` : Niveau de maîtrise initial (sur 100)
   - `last_practiced_at` : Timestamp de l'attribution

### 3. Intégration Frontend

#### Récupération du Statut

**Fichier**: `src/services/lessonService.ts`

```typescript
// Lignes 310-334
export async function fetchSkillStatus(
  skillKey: string,
  skillTitle?: string
): Promise<{
  skillKey: string;
  title: string;
  isUnlocked: boolean;
} | null>
```

- Interroge `user_skill_state` pour vérifier si une compétence est débloquée
- Retourne le statut avec le titre de la compétence

#### Affichage dans l'Interface

**Fichier**: `src/hooks/useLessonEngine.ts`

1. **Au démarrage de la leçon** (lignes 270-277) :
   - Récupère le statut de la première compétence attribuable
   - Affiche la compétence à débloquer dans `LessonCard`

2. **Après attribution** (lignes 475-486) :
   ```typescript
   if (coachOutput?.awardedSkills && coachOutput.awardedSkills.length > 0) {
     const skillKey = coachOutput.awardedSkills[0];
     const skillTitle = await fetchSkillTitle(skillKey);
     const status = await fetchSkillStatus(skillKey, skillTitle);
     if (status) {
       state.setSkillToUnlock({ ...status, isUnlocked: true });
     }
   }
   ```

3. **Notification utilisateur** :
   - Toast de notification en mode debug (lignes 468-472)
   - Mise à jour visuelle dans `LessonCard` (lignes 121-140 de `LessonCard.tsx`)

### 4. Utilisation des Compétences

#### Vérification des Prérequis

**Fichier**: `supabase/functions/teacher-greet/index.ts`

- Le système vérifie les compétences débloquées pour déterminer les leçons accessibles
- Les leçons avec `lesson_requires_skill` ne sont suggérées que si toutes les compétences requises sont débloquées

**Lignes 231-257** :
```typescript
const unlockedSkills = new Set(
  ((skillStates || []) as SkillState[])
    .filter((s) => s.unlocked)
    .map((s) => s.skill_key)
);

// Pour chaque leçon candidate
const activeRequiredSkills = new Set<string>();
for (const edge of lessonRequiresEdges) {
  if (edge.source_key === lesson.key) {
    activeRequiredSkills.add(edge.target_key);
  }
}

// Vérifie si tous les prérequis sont satisfaits
const allRequirementsMet = [...activeRequiredSkills]
  .every((sk) => unlockedSkills.has(sk));
```

## Points Clés du Mécanisme

### 1. Critères d'Attribution

Les compétences sont attribuées lorsque **toutes** ces conditions sont remplies :

1. ✅ La leçon a des compétences attribuables (`awardedSkills.length > 0`)
2. ✅ L'utilisateur a démontré une maîtrise suffisante :
   - **Option A** : Le coach LLM décide explicitement (`awardSkills: true`)
   - **Option B** : Pass streak >= 2 **ET** action suivante = `EXIT_TO_MAIN_TEACHER` ou `MAKE_HARDER`

### 2. Niveau de Maîtrise Initial

- **Valeur initiale** : `mastery = 1` (sur 100)
- **Note** : Le système actuel ne met pas à jour le niveau de maîtrise après l'attribution initiale
- **Potentiel d'amélioration** : Le système pourrait augmenter `mastery` avec la pratique répétée

### 3. Gestion des Conflits

- Utilisation de `upsert` avec `onConflict: "skill_key"`
- Si une compétence est déjà débloquée, elle est mise à jour (mais reste débloquée)
- Le `last_practiced_at` est mis à jour à chaque attribution

### 4. Isolation par Utilisateur

- Support pour `local_user_id` (ajouté dans migration `20251229095448`)
- Permet l'isolation des compétences par utilisateur local
- Les requêtes peuvent filtrer par `local_user_id` si fourni

## Flux Complet Résumé

```
1. [Curriculum] Définition des compétences et relations
   └─> curriculum_nodes (node_type='skill')
   └─> curriculum_edges (edge_type='lesson_awards_skill')

2. [Lesson Start] Récupération des compétences attribuables
   └─> lessonBrief.awardedSkills = ['skill1', 'skill2']
   └─> Affichage dans l'UI : "Compétence à débloquer"

3. [User Practice] L'utilisateur pratique la leçon
   └─> Enregistrements MIDI
   └─> Tentatives multiples possibles

4. [Lesson Evaluate] Évaluation de la performance
   └─> GraderOutput: { evaluation: 'pass'|'close'|'fail', ... }

5. [Lesson Decide] Décision du coach
   └─> Calcul des streaks (passStreak, failStreak)
   └─> Décision LLM ou garde-fous
   └─> Condition: passStreak >= 2 ET (EXIT ou MAKE_HARDER)
   └─> Attribution si conditions remplies

6. [Database] Mise à jour user_skill_state
   └─> unlocked = true
   └─> mastery = 1
   └─> last_practiced_at = now()

7. [Frontend] Mise à jour de l'interface
   └─> Notification utilisateur
   └─> Affichage "Compétence débloquée !"
   └─> Nouvelles leçons accessibles (si prérequis satisfaits)
```

## Points d'Attention et Améliorations Potentielles

### 1. Niveau de Maîtrise Statique

**Problème actuel** : Le niveau de maîtrise reste à 1 après l'attribution initiale.

**Amélioration suggérée** :
- Augmenter `mastery` progressivement avec la pratique répétée
- Utiliser un système de points ou de répétitions réussies

### 2. Attribution Multiple

**Comportement actuel** : Si une leçon attribue plusieurs compétences, elles sont toutes attribuées simultanément.

**Considération** : Est-ce le comportement souhaité ? Ou devrait-on attribuer les compétences progressivement ?

### 3. Validation des Prérequis

**Comportement actuel** : Les prérequis sont vérifiés au niveau de la suggestion de leçons, mais pas au démarrage.

**Amélioration suggérée** : Valider les prérequis dans `lesson-start` et refuser le démarrage si non satisfaits.

### 4. Historique d'Attribution

**Comportement actuel** : Pas de log détaillé des attributions.

**Amélioration suggérée** : Créer une table `skill_unlock_events` (déjà présente dans le schéma curriculum mais non utilisée dans le schéma public) pour tracer l'historique.

### 5. Gestion des Erreurs

**Comportement actuel** : Les erreurs d'upsert sont loggées mais n'empêchent pas le processus.

**Amélioration suggérée** : Retourner les erreurs au frontend pour notification utilisateur.

## Conclusion

Le mécanisme d'attribution de compétences est bien structuré et suit un flux logique :

1. **Définition claire** dans le curriculum
2. **Attribution conditionnelle** basée sur la performance
3. **Persistance** dans la base de données
4. **Feedback visuel** à l'utilisateur

Le système utilise intelligemment les "pass streaks" pour déterminer la maîtrise, et combine décision LLM avec des garde-fous déterministes pour assurer une attribution cohérente.

Les principales opportunités d'amélioration concernent :
- L'évolution du niveau de maîtrise après l'attribution initiale
- La traçabilité des attributions
- La validation des prérequis au démarrage des leçons

