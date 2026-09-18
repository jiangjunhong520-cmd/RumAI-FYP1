// Client-side room inference, palette extraction and sample furniture recommendations.
const input = document.querySelector('#file-input');
const preview = document.querySelector('#preview');
const confirmButton = document.querySelector('#confirm');
let photoURL;
let uploadNumber = 0;
let confirmedStyle = null;
let roomPalette = [];
let userPreferences = {
  colour: [],
  shape: [],
  function: []
};
let rawPrediction = null;
let selectionRevision = 0;
let predictionTimer;
let predictionAttempt = 0;

function predictionError(message) {
  document.querySelector('#suggested-style').textContent = 'Prediction unavailable';
  document.querySelector('#confidence').textContent = '—';
  document.querySelector('#ai-note').textContent = message + ' You can select and confirm a style manually.';
}
function safePrediction(image, onStatus) {
  try { return Promise.resolve(RoomAI.predict(image, onStatus)); }
  catch (error) { return Promise.reject(error); }
}

// The native file input receives the tap directly; no scripted picker activation.
input.addEventListener('change', () => {
  const file = input.files[0];
  if (!file) return;
  const status = document.querySelector('#upload-status');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
    status.textContent = 'Please choose a JPG, PNG or WebP image smaller than 15 MB.';
    input.value = '';
    return;
  }
  // Decode first so an invalid image does not replace an existing preview.
  const uploadStart = performance.now();
  const metrics = {fileBytes:file.size};
  const number = ++uploadNumber;
  const url = URL.createObjectURL(file);
  const check = new Image();
  check.onload = () => {
    if (number !== uploadNumber) { URL.revokeObjectURL(url); return; }
    metrics.decodeMs = performance.now()-uploadStart;
    metrics.imageSize = [check.naturalWidth,check.naturalHeight];
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = url;
    preview.src = url;
    preview.hidden = false;
    document.querySelector('#upload-prompt').hidden = true;
    document.querySelector('#upload-button').textContent = 'Change Room Image';
    document.querySelector('#file-note').textContent = file.name;
    confirmedStyle = null;
    rawPrediction = null;

    if (preferencesSection) {
  preferencesSection.hidden = true;
  resetPreferences();
}

    selectionRevision++;
    document.querySelectorAll('input[name="style"]').forEach(radio => { radio.checked = false; });
    confirmButton.disabled = true;
    document.querySelector('#style-status').textContent = 'Confirm the predicted style or choose your own.';
    document.querySelector('#collection-title').textContent = 'Your recommended sofas';
    status.textContent = 'Photo ready. Analysing locally in your browser.';
    document.querySelector('#suggested-style').textContent = 'Loading…';
    document.querySelector('#confidence').textContent = '—';
    const revision = selectionRevision;
    clearTimeout(predictionTimer);
    const attempt = ++predictionAttempt;
    let expired = false;
    predictionTimer = setTimeout(() => {
      if (attempt !== predictionAttempt) return;
      expired = true;
      predictionError('AI took too long to respond. No prediction is being claimed.');
    }, 45000);
    // Promise boundary also catches synchronous failures (e.g. a script failed to load).
    safePrediction(check, message => {
      if (number === uploadNumber && !expired) document.querySelector('#ai-note').textContent = message;
    }).then(result => {
      if (number !== uploadNumber || expired) return; // Ignore an obsolete upload or timeout.
      if (!result || !['Industrial','Minimalist','Modern','Scandinavian'].includes(result.style) ||
          !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) throw new Error('Invalid AI result');
      // Validate/format the whole result before updating either field.
      const confidenceText = `${(result.confidence * 100).toFixed(1)}%`;
      const uiStart = performance.now();
      rawPrediction = result;
      document.querySelector('#suggested-style').textContent = result.style;
      document.querySelector('#confidence').textContent = confidenceText;
      document.querySelector('#ai-note').textContent = 'MobileNetV3Small prediction. Confidence is a model score, not a guarantee.';
      // Do not overwrite a choice made while inference was running.
      if (revision === selectionRevision && !confirmedStyle) {
        document.querySelector(`input[name="style"][value="${result.style}"]`).checked = true;
        confirmButton.disabled = false;
      }
      metrics.uiUpdateMs = performance.now()-uiStart;
      metrics.totalUploadToResultMs = performance.now()-uploadStart;
      Object.assign(metrics,result.timings || {});
      console.info('RumAI upload timing',metrics);
      document.querySelector('#performance-log').textContent = JSON.stringify(metrics,null,2);
    }).catch(error => {
      if (number !== uploadNumber || expired) return;
      console.error('RumAI prediction failed', error);
      predictionError('AI could not finish. Try selecting the image again shortly.');
    }).finally(() => { if (attempt === predictionAttempt) clearTimeout(predictionTimer); });
    input.value = '';
    // Palette extraction is independent of AI success.
    const palette = document.querySelector('#room-palette');
    const list = document.querySelector('#colour-list');
    const colourStatus = document.querySelector('#colour-status');
    palette.hidden = false;
    list.replaceChildren();
    roomPalette = [];
    try {
      const colourStart = performance.now();
      const colours = RoomColours.extract(check);
      metrics.kmeansMs = performance.now()-colourStart;
      roomPalette = colours;
      colours.forEach(({ rgb, hsv, weight }) => {
        const card = document.createElement('div');
        card.className = 'colour-card';
        if (weight === 0) {
          card.innerHTML = '<div class="colour-swatch empty"></div><p>No additional colour</p><small>0% of sample</small>';
        } else {
          const [h, s, v] = hsv;
          card.innerHTML = `<div class="colour-swatch" style="background:rgb(${rgb.join(',')})"></div><p>RGB ${rgb.join(', ')}</p><small>HSV ${Math.round(h) % 360}° / ${s.toFixed(1)}% / ${v.toFixed(1)}%</small><b>≈ ${weight.toFixed(1)}%</b>`;
        }
        list.append(card);
      });
      colourStatus.textContent = colours.length
        ? 'Palette ready. HSV: hue / saturation / value. Used to rank the sample sofas.'
        : 'No visible pixels found. Try a photo without transparency.';
    } catch (error) {
      colourStatus.textContent = 'Could not read the colours in this image. Please try another photo.';
    }
    showCollection();
  };
  check.onerror = () => {
    URL.revokeObjectURL(url);
    if (number === uploadNumber) status.textContent = 'This image could not be opened. Please try a different file.';
    input.value = '';
  };
  check.src = url;
});

document.querySelectorAll('input[name="style"]').forEach(radio => {
  radio.addEventListener('change', () => {
    selectionRevision++;
    confirmButton.disabled = false;
    document.querySelector('#style-status').textContent = `${radio.value} selected. Confirm to update the collection.`;
  });
});

// Score every catalogue item before selecting the Top 5.
function showCollection() {
 const items = Recommendations.rank(
  catalogue,
  confirmedStyle,
  roomPalette,
  userPreferences
).slice(0, 5);
  const hasPreferences =
  userPreferences.colour.length > 0 ||
  userPreferences.shape.length > 0 ||
  userPreferences.function.length > 0;

document.querySelector('#collection-note').textContent =
  items.length
    ? (
        hasPreferences
          ? 'Top 5 from all prototype sofas, ranked using your selected preferences and room compatibility.'
          : 'Top 5 from all prototype sofas, ranked using room compatibility.'
      )
    : 'Upload a room photo, confirm a style and apply your preferences to see recommendations.';
  document.querySelector('#sofa-grid').replaceChildren();
  items.forEach(({
  item,
  bestColourOption,
  roomCompatibility,
  preferredColourMatch,
  shapeMatch,
  functionMatch,
  exactPreferenceMatch,
  finalScore
}) => {
    const name = item.name;
    const card = document.createElement('article');
    card.className = 'sofa-card';
    card.innerHTML = `<div class="sofa-image"><img alt="Prototype sofa illustration; not a product photograph"><span>Prototype illustration</span></div><div class="sofa-copy"><p class="eyebrow"></p><h3></h3><p class="details"></p><div class="card-actions"><button type="button" data-feature="3D">View in 3D</button><button type="button" data-feature="AR">View in AR</button></div></div>`;
    // Text from JSON uses textContent, so it cannot inject markup.
    card.querySelector('img').src = item.image;
    // Only approved pilot files override the catalogue SVG; missing JPGs fall back.
    const pilotIds = ['SOFA-IND-1', 'SOFA-MIN-1', 'SOFA-MOD-1', 'SOFA-SCA-1'];
    if (pilotIds.includes(item.itemId)) {
      const image = card.querySelector('img');
      const badge = card.querySelector('.sofa-image span');
      const jpg = `assets/sofas/${item.style.toLowerCase()}/${item.itemId.toLowerCase()}.jpg`;
      image.onload = () => {
        if (image.getAttribute('src') === jpg) {
          image.alt = `${item.name} — realistic prototype image, not a commercial product`;
          badge.textContent = 'Realistic prototype image';
        }
      };
      image.onerror = () => {
        image.onerror = null;
        image.onload = null;
        image.alt = 'Prototype sofa illustration; not a product photograph';
        badge.textContent = 'Prototype illustration';
        image.src = item.image;
      };
      image.src = jpg;
    }
    card.querySelector('.eyebrow').textContent = `${item.style} collection · sample`;
    card.querySelector('h3').textContent = name;
    const recommendedColour =
  bestColourOption?.productColourName ||
  item.primaryColour;

card.querySelector('.details').textContent =
  `${recommendedColour} · ${item.shape} · ${item.function} · W ${item.width} × H ${item.height} × D ${item.depth} cm`;
    const scores = document.createElement('p');
    const scoreRows = [];
    if (hasPreferences) {
      [
        ['Colour', userPreferences.colour, preferredColourMatch],
        ['Shape', userPreferences.shape, shapeMatch],
        ['Function', userPreferences.function, functionMatch]
      ].forEach(([label, selected, match]) => {
        const status = selected.length === 0
          ? 'Not selected'
          : match === 1 ? 'Matched' : 'Not matched';
        scoreRows.push(`${label} Match: ${status}`);
      });
    }
    scoreRows.push(
      `Room Compatibility: ${(roomCompatibility * 100).toFixed(1)}%`,
      `Overall Match: ${(finalScore * 100).toFixed(1)}%`
    );
    scoreRows.forEach((text, index) => {
      if (index > 0) scores.append(document.createElement('br'));
      scores.append(document.createTextNode(text));
    });

const explanation = document.createElement('p');

if (hasPreferences) {
  explanation.textContent =
    exactPreferenceMatch
      ? 'Matches all of your active sofa preferences.'
      : 'No exact match is available for all active preferences. This is one of the closest alternatives.';
} else {
  explanation.textContent =
    'No specific sofa preferences were selected, so this result is ranked using room compatibility.';
}

card.querySelector('.card-actions').before(
  scores,
  explanation
);
    card.querySelectorAll('[data-feature]').forEach(button => button.addEventListener('click', () => {
      const feature = button.dataset.feature;
      if (feature === 'AR') {
        const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (/Macintosh|MacIntel/i.test(navigator.userAgent + ' ' + navigator.platform) && navigator.maxTouchPoints > 1);
        if (appleMobile) {
          import('./quick-look.js').then(module => module.openQuickLook(item)).catch(() => {
            document.querySelector('#dialog-title').textContent = 'AR unavailable';
            document.querySelector('#dialog-description').textContent = 'Quick Look could not load. Return to the sofa card and use View in 3D, or reopen the HTTPS page in Safari.';
            document.querySelector('#feature-dialog').showModal();
          });
          return;
        }
        import('./ar.js').then(ar => ar.openAR(item)).catch(() => {
          document.querySelector('#dialog-title').textContent = 'AR could not open';
          document.querySelector('#dialog-description').textContent = 'Use a local static server or HTTPS to load the AR module. You can return to this sofa’s View in 3D button for the interactive fallback.';
          document.querySelector('#feature-dialog').showModal();
        });
        return;
      }
      if (feature === '3D') {
        import('./viewer.js').then(viewer => viewer.openViewer(item)).catch(() => {
          document.querySelector('#dialog-title').textContent = '3D viewer unavailable';
          document.querySelector('#dialog-description').textContent = 'Open RumAI through a local static server at http://localhost:8000. The browser cannot load the 3D modules from a directly opened HTML file.';
          document.querySelector('#feature-dialog').showModal();
        });
        return;
      }
      document.querySelector('#dialog-title').textContent = `${name} in ${feature}`;
      document.querySelector('#dialog-description').textContent = feature === '3D'
        ? 'A 3D preview will let you explore this piece from every angle. This feature is a placeholder in the current prototype.'
        : 'An AR preview will let you imagine this piece in your room. This feature is a placeholder; your camera will not open.';
      document.querySelector('#feature-dialog').showModal();
    }));
    document.querySelector('#sofa-grid').append(card);
  });
}
// --------------------------------------------------
// Preference UI
// --------------------------------------------------

const preferencesSection = document.querySelector('#preferences');
const applyPreferencesButton = document.querySelector('#apply-preferences');
const preferenceStatus = document.querySelector('#preference-status');

function getPreferenceGroup(groupName) {
  return document.querySelector(
    `.preference-options[data-group="${groupName}"]`
  );
}

function clearPreferenceError(groupName) {
  const error = document.querySelector(
    `[data-error="${groupName}"]`
  );

  if (error) {
    error.textContent = '';
  }
}

function showPreferenceError(groupName, message) {
  const error = document.querySelector(
    `[data-error="${groupName}"]`
  );

  if (!error) return;

  error.textContent = message;

  window.clearTimeout(error._timer);

  error._timer = window.setTimeout(() => {
    error.textContent = '';
  }, 3500);
}

function initialisePreferenceGroup(groupName) {
  const group = getPreferenceGroup(groupName);

  if (!group) return;

  const allCheckbox = group.querySelector('[data-all]');
  const specificCheckboxes = [
    ...group.querySelectorAll(
      'input[type="checkbox"]:not([data-all])'
    )
  ];

  // Default = All
  allCheckbox.checked = true;

  allCheckbox.addEventListener('change', () => {
    clearPreferenceError(groupName);

    if (allCheckbox.checked) {
      specificCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
      });
    } else {
      // Prevent an empty category.
      const hasSpecificSelection =
        specificCheckboxes.some(checkbox => checkbox.checked);

      if (!hasSpecificSelection) {
        allCheckbox.checked = true;
      }
    }
  });

  specificCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      clearPreferenceError(groupName);

      if (checkbox.checked) {
        const selected = specificCheckboxes.filter(
          option => option.checked
        );

        if (selected.length > 2) {
          checkbox.checked = false;

          const labels = {
            colour: 'colours',
            shape: 'shapes',
            function: 'functions'
          };

          showPreferenceError(
            groupName,
            `You can select up to 2 ${labels[groupName]}. Please deselect one before choosing another.`
          );

          return;
        }

        allCheckbox.checked = false;
      }

      const remaining = specificCheckboxes.filter(
        option => option.checked
      );

      // If the user deselects every specific option,
      // return the category to All.
      if (remaining.length === 0) {
        allCheckbox.checked = true;
      }
    });
  });
}

function resetPreferences() {
  ['colour', 'shape', 'function'].forEach(groupName => {
    const group = getPreferenceGroup(groupName);

    if (!group) return;

    const allCheckbox = group.querySelector('[data-all]');

    group.querySelectorAll(
      'input[type="checkbox"]'
    ).forEach(checkbox => {
      checkbox.checked = false;
    });

    allCheckbox.checked = true;

    clearPreferenceError(groupName);
  });

  userPreferences = {
    colour: [],
    shape: [],
    function: []
  };
}

function readPreferenceGroup(groupName) {
  const group = getPreferenceGroup(groupName);

  if (!group) return [];

  const allCheckbox = group.querySelector('[data-all]');

  if (allCheckbox.checked) {
    return [];
  }

  return [
    ...group.querySelectorAll(
      'input[type="checkbox"]:not([data-all]):checked'
    )
  ].map(checkbox => checkbox.value);
}

['colour', 'shape', 'function'].forEach(
  initialisePreferenceGroup
);

applyPreferencesButton.addEventListener('click', () => {
  userPreferences = {
    colour: readPreferenceGroup('colour'),
    shape: readPreferenceGroup('shape'),
    function: readPreferenceGroup('function')
  };

  console.info(
    'RumAI user preferences',
    userPreferences
  );

  preferenceStatus.textContent =
     'Preferences applied. The Top 5 recommendations have been updated.';
  // For Step 2, keep the existing Recommendation v1 unchanged.
  showCollection();

  document.querySelector('#recommendations').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});
confirmButton.addEventListener('click', () => {
  const selectedStyle =
    document.querySelector('input[name="style"]:checked');

  if (!selectedStyle) return;

  const style = selectedStyle.value;

  confirmedStyle = style;

  resetPreferences();

  preferencesSection.hidden = false;

  document.querySelector('#collection-title').textContent =
    `A ${style.toLowerCase()} point of view.`;

  document.querySelector('#style-status').textContent =
    `${style} confirmed. Choose your sofa preferences below.`;

  preferenceStatus.textContent =
    'Preferences are optional. You can keep All selected.';

  preferencesSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});
