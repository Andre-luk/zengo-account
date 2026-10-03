# Analyse prédictive — zones à risque

Dernier volet de l'itération 2 : regrouper les incidents par zone et signaler
les zones à risque, pour passer d'une supervision « événement par événement » à
une lecture territoriale (prévention, tournées de contrôle, renforts).

---

## 1. Principe

1. **Maillage** — le territoire est découpé en mailles de 0,05° (≈ 5,5 km)
   autour de l'équateur : deux alertes proches tombent dans la même maille, quel
   que soit le pays.
2. **Comptage** — sur une fenêtre glissante (30 jours par défaut), on compte les
   alertes géolocalisées de la maille, dont celles **confirmées** (statut
   `ASSIGNED`, `IN_PROGRESS` ou `RESOLVED`).
3. **Pondération** — chaque maille reçoit un score explicable :

   $$\text{score} = \min\left(100,\; \underbrace{2 \times n}_{\text{volume}} + \underbrace{4 \times w_{\text{type}}}_{\text{nature}} + \underbrace{30 \times \tfrac{c}{n}}_{\text{confirmation}}\right)$$

   où $n$ est le nombre d'alertes, $c$ le nombre d'alertes confirmées et
   $w_{\text{type}}$ le poids de la nature dominante :

   | Nature dominante | Poids |
   |---|---|
   | Incendie | 5 |
   | Urgence médicale, bouton panique, fuite de gaz | 4 |
   | Intrusion, sabotage | 3 |
   | Dégât des eaux, alarme technique | 1 |

4. **Qualification** — le score est traduit en niveau :

   | Niveau | Score |
   |---|---|
   | Critique | ≥ 80 |
   | Élevé | ≥ 45 |
   | Modéré | ≥ 20 |
   | Calme | < 20 |

5. **Tendance** — les alertes des 7 derniers jours sont comparées à celles de la
   période précédente de même durée. Une variation inférieure à 20 % est
   considérée comme du bruit et non comme une tendance.

### Pourquoi ces choix

- **Le volume compte, mais pas seul** : un capteur défaillant déclenche souvent.
  La part d'alertes confirmées empêche de qualifier de dangereuse une zone qui
  ne produit que des faux positifs (test unitaire dédié).
- **Un seuil de volume** (`minAlerts`, 2 par défaut) évite de qualifier une zone
  sur un événement isolé.
- **Le score reste borné à 100** et la console affiche toujours les chiffres qui
  l'ont produit : le résultat doit pouvoir être discuté avec un chef d'agence.

---

## 2. API

Authentification JWT requise. Les données sont systématiquement restreintes au
périmètre organisationnel de l'utilisateur (matérialisation de l'arborescence).

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/alerts/risk/zones?days=&limit=&minAlerts=` | Zones notées, de la plus risquée à la moins risquée |
| `GET` | `/alerts/risk/summary?days=&limit=` | Synthèse : volumes, villes, zones, clients répétés, seuils |
| `GET` | `/alerts/risk/cities` | Villes du périmètre (filtres de console) |

### Exemple — `GET /alerts/risk/zones?days=90&limit=3`

```json
{
  "windowDays": 90,
  "precisionDegrees": 0.05,
  "minAlerts": 2,
  "zones": [
    {
      "cell": "-11.6500,27.4500",
      "latitude": -11.63,
      "longitude": 27.46,
      "city": "Lubumbashi",
      "alerts": 124,
      "confirmed": 102,
      "byType": [
        { "type": "INTRUSION", "count": 64 },
        { "type": "MEDICAL", "count": 31 }
      ],
      "score": 100,
      "level": "CRITIQUE",
      "recentAlerts": 124,
      "trend": "EN_HAUSSE",
      "lastAlertAt": "2026-10-03T18:47:43.705Z"
    }
  ]
}
```

`byType` est renvoyé pour chaque zone : la console peut donc expliquer le score
(nature dominante) sans requête supplémentaire.

### Synthèse

`GET /alerts/risk/summary` renvoie, pour le tableau de bord :

- `total`, `confirmed`, `confirmationRate` — volumes de la période ;
- `byLevel` — répartition des zones qualifiées par niveau ;
- `topZones` — les zones les plus sensibles ;
- `byCity` — les huit premières villes par volume ;
- `repeatClients` — clients ayant déclenché au moins **3** alertes sur la
  période (visite de contrôle conseillée) ;
- `thresholds` — les seuils du modèle, pour que la console n'invente pas ses
  propres libellés.

> `byLevel` est calculé sur les 25 premières zones qualifiées : chaque zone
> analysée coûte une requête de répartition par nature d'alerte, la borne évite
> qu'un tableau de bord ne déclenche des dizaines de requêtes.

---

## 3. Console

Le tableau de bord affiche la carte **Zones à risque** (fenêtre 90 jours) :

- ville et maille concernées ;
- volume d'alertes et part confirmée ;
- nature dominante des déclenchements ;
- badge de niveau, flèche de tendance, barre de score ;
- nombre d'alertes sur les 7 derniers jours ;
- bandeau d'alerte lorsque des clients déclenchent de manière répétée.

---

## 4. Exploitation

| Situation observée | Action recommandée |
|---|---|
| Zone critique, tendance en hausse | Renfort d'équipe sur la zone, tournée de contrôle des installations |
| Zone critique, part confirmée faible | Vérifier les capteurs et la configuration des sous-appareils de la zone |
| Client à déclenchements répétés | Visite technique : réglage, position des capteurs, formation du client |
| Zone calme mais volume élevé | Sensibiliser, sans engager de moyens exceptionnels |

---

## 5. Tests

| Suite | Périmètre | Résultat |
|---|---|---|
| `risk.util.spec.ts` | maillage, score et bornes, seuils, tendances, clients répétés | 19 tests |
| `npm run smoke:alerts` | zones, classement, seuil de volume, synthèse, villes, sécurité | section 9 |

```bash
npm run test            # 138 tests unitaires
npm run smoke:alerts    # 73 contrôles de bout en bout
```
