// RumAI Recommendation Engine v2
// Prototype weighting policy:
// 60% User Preference Satisfaction + 40% Room Compatibility.
// If no specific user preferences are selected,
// the recommendation is based 100% on Room Compatibility.
//
// Preference base weights:
// Colour = 30%
// Shape = 40%
// Function = 30%
// Inactive categories are excluded and the remaining
// preference weights are automatically renormalised.

const Recommendations = (() => {

  // --------------------------------------------------
  // HSV similarity
  // --------------------------------------------------

  function similarity(a, b) {
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      a.length < 3 ||
      b.length < 3
    ) {
      return 0;
    }

    const hueA = ((a[0] % 360) + 360) % 360;
    const hueB = ((b[0] % 360) + 360) % 360;

    const hueGap = Math.abs(hueA - hueB);
    const hueDistance =
      Math.min(hueGap, 360 - hueGap) / 180;

    const saturationDistance =
      Math.abs(a[1] - b[1]) / 100;

    const valueDistance =
      Math.abs(a[2] - b[2]) / 100;

    return Math.max(
      0,
      Math.min(
        1,
        1 -
          (
            hueDistance +
            saturationDistance +
            valueDistance
          ) / 3
      )
    );
  }


  // --------------------------------------------------
  // Room palette weighting
  // --------------------------------------------------

  function preparePalette(palette) {
    if (!Array.isArray(palette) || palette.length === 0) {
      return [];
    }

    const valid = palette.filter(
      colour =>
        colour &&
        Array.isArray(colour.hsv)
    );

    if (valid.length === 0) {
      return [];
    }

    const hasValidWeights =
      valid.every(
        colour =>
          Number.isFinite(colour.weight) &&
          colour.weight >= 0
      ) &&
      valid.some(
        colour => colour.weight > 0
      );

    const totalWeight = hasValidWeights
      ? valid.reduce(
          (sum, colour) =>
            sum + colour.weight,
          0
        )
      : valid.length;

    return valid.map(colour => ({
      hsv: colour.hsv,

      weight:
        (hasValidWeights
          ? colour.weight
          : 1) / totalWeight
    }));
  }


  // --------------------------------------------------
  // Compare one sofa colour option with room palette
  // --------------------------------------------------

  function roomColourSimilarity(
    colourOption,
    preparedPalette
  ) {
    if (
      !colourOption ||
      !Array.isArray(colourOption.hsv) ||
      preparedPalette.length === 0
    ) {
      return 0;
    }

    return preparedPalette.reduce(
      (sum, roomColour) =>
        sum +
        roomColour.weight *
          similarity(
            roomColour.hsv,
            colourOption.hsv
          ),
      0
    );
  }


  // --------------------------------------------------
  // User preference helpers
  // --------------------------------------------------

  function normalisePreferences(preferences = {}) {
    return {
      colour: Array.isArray(preferences.colour)
        ? preferences.colour
        : [],

      shape: Array.isArray(preferences.shape)
        ? preferences.shape
        : [],

      function: Array.isArray(preferences.function)
        ? preferences.function
        : []
    };
  }


  function getActivePreferenceWeights(preferences) {
    const baseWeights = {
      colour: 0.30,
      shape: 0.40,
      function: 0.30
    };

    const active = {};

    for (const key of Object.keys(baseWeights)) {
      if (
        Array.isArray(preferences[key]) &&
        preferences[key].length > 0
      ) {
        active[key] = baseWeights[key];
      }
    }

    const total = Object.values(active)
      .reduce(
        (sum, weight) => sum + weight,
        0
      );

    if (total === 0) {
      return {};
    }

    for (const key of Object.keys(active)) {
      active[key] =
        active[key] / total;
    }

    return active;
  }


  function categoryMatch(
    selectedValues,
    actualValue
  ) {
    if (
      !Array.isArray(selectedValues) ||
      selectedValues.length === 0
    ) {
      return null;
    }

    return selectedValues.includes(actualValue)
      ? 1
      : 0;
  }


  function colourPreferenceMatch(
    selectedFamilies,
    colourOption
  ) {
    if (
      !Array.isArray(selectedFamilies) ||
      selectedFamilies.length === 0
    ) {
      return null;
    }

    if (!colourOption) {
      return 0;
    }

    return selectedFamilies.includes(
      colourOption.colourFamily
    )
      ? 1
      : 0;
  }


  // --------------------------------------------------
  // Score one sofa colour variant
  // --------------------------------------------------

  function scoreVariant({
    item,
    colourOption,
    confirmedStyle,
    preparedPalette,
    preferences,
    activeWeights
  }) {

    const styleMatch =
      item.style === confirmedStyle
        ? 1
        : 0;

    const roomColourMatch =
      roomColourSimilarity(
        colourOption,
        preparedPalette
      );

    // Room Compatibility:
    // 50% confirmed style
    // 50% room-colour HSV compatibility
    const roomCompatibility =
      0.5 * styleMatch +
      0.5 * roomColourMatch;


    const preferredColourMatch =
      colourPreferenceMatch(
        preferences.colour,
        colourOption
      );

    const shapeMatch =
      categoryMatch(
        preferences.shape,
        item.shape
      );

    const functionMatch =
      categoryMatch(
        preferences.function,
        item.function
      );


    let userPreferenceScore = null;

    const hasActivePreferences =
      Object.keys(activeWeights).length > 0;

    if (hasActivePreferences) {
      userPreferenceScore = 0;

      if (
        Object.prototype.hasOwnProperty.call(
          activeWeights,
          "colour"
        )
      ) {
        userPreferenceScore +=
          activeWeights.colour *
          preferredColourMatch;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          activeWeights,
          "shape"
        )
      ) {
        userPreferenceScore +=
          activeWeights.shape *
          shapeMatch;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          activeWeights,
          "function"
        )
      ) {
        userPreferenceScore +=
          activeWeights.function *
          functionMatch;
      }
    }


    // If all three categories are "All",
    // ranking is entirely room-based.
    const finalScore =
      hasActivePreferences
        ? (
            0.60 *
              userPreferenceScore +
            0.40 *
              roomCompatibility
          )
        : roomCompatibility;


    return {
      colourOption,

      styleMatch,
      roomColourMatch,
      roomCompatibility,

      preferredColourMatch,
      shapeMatch,
      functionMatch,

      userPreferenceScore,
      finalScore
    };
  }


  // --------------------------------------------------
  // Rank all sofas
  // --------------------------------------------------

  function rank(
    items,
    confirmedStyle,
    palette,
    preferences = {}
  ) {

    if (
      !Array.isArray(items) ||
      !confirmedStyle ||
      !Array.isArray(palette) ||
      palette.length === 0
    ) {
      return [];
    }

    const preparedPalette =
      preparePalette(palette);

    if (preparedPalette.length === 0) {
      return [];
    }

    const normalisedPreferences =
      normalisePreferences(preferences);

    const activeWeights =
      getActivePreferenceWeights(
        normalisedPreferences
      );


    const scoredItems = items.map(item => {

      // v2 catalogue uses colourOptions[].
      // Legacy primary colour remains as a temporary
      // fallback during migration.
      const colourOptions =
        Array.isArray(item.colourOptions) &&
        item.colourOptions.length > 0
          ? item.colourOptions
          : [
              {
                productColourName:
                  item.primaryColour ||
                  "Default",

                colourFamily: null,

                rgb:
                  item.primaryRGB ||
                  null,

                hsv:
                  item.primaryHSV ||
                  null,

                image:
                  item.image ||
                  ""
              }
            ];


      // Score every available colour variant.
      const variants =
        colourOptions.map(colourOption =>
          scoreVariant({
            item,
            colourOption,
            confirmedStyle,
            preparedPalette,
            preferences:
              normalisedPreferences,
            activeWeights
          })
        );


      // Same sofa appears once.
      // Choose the colour option producing
      // the highest complete recommendation score.
      variants.sort(
        (a, b) =>
          b.finalScore -
            a.finalScore ||
          String(
            a.colourOption
              .productColourName
          ).localeCompare(
            String(
              b.colourOption
                .productColourName
            )
          )
      );

      const best = variants[0];


      const activeMatches = [];

      if (
        normalisedPreferences
          .colour.length > 0
      ) {
        activeMatches.push(
          best.preferredColourMatch
        );
      }

      if (
        normalisedPreferences
          .shape.length > 0
      ) {
        activeMatches.push(
          best.shapeMatch
        );
      }

      if (
        normalisedPreferences
          .function.length > 0
      ) {
        activeMatches.push(
          best.functionMatch
        );
      }

      const exactPreferenceMatch =
        activeMatches.length === 0
          ? true
          : activeMatches.every(
              value => value === 1
            );


      return {
        item,

        bestColourOption:
          best.colourOption,

        styleMatch:
          best.styleMatch,

        colourMatch:
          best.roomColourMatch,

        roomColourMatch:
          best.roomColourMatch,

        roomCompatibility:
          best.roomCompatibility,

        preferredColourMatch:
          best.preferredColourMatch,

        shapeMatch:
          best.shapeMatch,

        functionMatch:
          best.functionMatch,

        userPreferenceScore:
          best.userPreferenceScore,

        exactPreferenceMatch,

        finalScore:
          best.finalScore
      };
    });


    // Deterministic ranking:
    // score first, itemId second.
    return scoredItems.sort(
      (a, b) =>
        b.finalScore -
          a.finalScore ||
        (
          a.item.itemId <
          b.item.itemId
            ? -1
            : a.item.itemId >
              b.item.itemId
              ? 1
              : 0
        )
    );
  }


  return {
    similarity,
    rank
  };

})();