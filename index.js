const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pdftk = require('node-pdftk');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { passport, requireAuth, register: registerAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

// Auth routes (/login, /verify, /auth/*)
registerAuth(app);

// Serve main app — auth required
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static assets (CSS, JS, images) — no auth needed so login page assets load
app.use(express.static(path.join(__dirname, 'public')));

const PDF_MAL = path.join(__dirname, 'skjema.pdf');

const Q_KEYS = [
  'vehicleStill', 'vehicleStarting', 'wasStopping',
  'exitingParking', 'enteringParking', 'enteringRoundabout',
  'exitingRoundabout', 'hitFromBehind', 'drivingParallelLane',
  'changedLane', 'wasPassing', 'turnedRight', 'turnedLeft',
  'wasBackingUp', 'enteredWrongDirectionLane',
  'cameFromRightAtIntersection', 'ignoredRightOfWaySignalOrRedLight'
];

function lagFDF(data) {
  const felt = [];

  const legg = (navn, verdi) => {
    if (verdi == null || verdi === '') return;
    const trygg = String(verdi).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    felt.push(`<< /T (${navn}) /V (${trygg}) >>`);
  };

  const kryss = (base, erJa) => {
    felt.push(`<< /T (${base}_0) /V (${erJa ? '/Off' : '/Yes'}) >>`);
    felt.push(`<< /T (${base}_1) /V (${erJa ? '/Yes' : '/Off'}) >>`);
  };

  legg('text_datePart', data.date);
  legg('text_timePart', data.time);
  legg('text_combinedLocation', data.place);
  legg('text_county', data.municipality);
  legg('text_country', data.country || 'Norge');
  kryss('cb_injury', data.injury === 'ja');
  kryss('cb_materialDamageOtherThanInvolvedVehicles', data.material === 'ja');
  legg('text_A/witness/combinedWitnessDetails', data.witnesses);

  ['A', 'B'].forEach(side => {
    const s = side.toLowerCase();
    legg(`text_${side}/insureeContactInfo/lastName`,      data[`${s}LastName`]);
    legg(`text_${side}/insureeContactInfo/firstName`,     data[`${s}FirstName`]);
    legg(`text_${side}/insureeContactInfo/birthDate`,     data[`${s}Dob`]);
    legg(`text_${side}/insureeContactInfo/address`,       data[`${s}Address`]);
    legg(`text_${side}/insureeContactInfo/postal`,
      [data[`${s}Zip`], data[`${s}City`]].filter(Boolean).join(' '));
    legg(`text_${side}/insureeContactInfo/phone`,         data[`${s}Phone`]);
    legg(`text_${side}/insureeContactInfo/email`,         data[`${s}Email`]);
    legg(`text_${side}/vehicleData/licensePlateNumber`,   data[`${s}Reg`]);
    legg(`text_${side}/vehicleData/makeModel`,            data[`${s}Model`]);
    legg(`text_${side}/vehicleData/registrationCountry`,  data[`${s}RegCountry`] || 'Norge');
    legg(`text_${side}/insurance/companyName`,            data[`${s}Insurer`]);
    legg(`text_${side}/insurance/agreementNumber`,        data[`${s}Policy`]);
    legg(`text_${side}/driver/driversLicenseNumber`,      data[`${s}DriverLic`]);
    legg(`text_${side}/damageDescription/text`,           data[`${s}Damage`]);
    legg(`text_${side}/comments/text`,                    data[`${s}Remarks`]);
  });

  kryss('cb_A/insurance/comprehensiveInsurance', data.aKasko === 'ja');

  const pA = data.pA || [];
  const pB = data.pB || [];
  Q_KEYS.forEach(k => {
    felt.push(`<< /T (cb_Questions/A/${k}) /V (${pA.includes(k) ? '/Yes' : '/Off'}) >>`);
    felt.push(`<< /T (cb_Questions/B/${k}) /V (${pB.includes(k) ? '/Yes' : '/Off'}) >>`);
  });

  legg('text_SumCrosses/A', String(pA.length));
  legg('text_SumCrosses/B', String(pB.length));

  return `%FDF-1.2\n1 0 obj\n<<\n/FDF\n<<\n/Fields [\n${felt.join('\n')}\n]\n>>\n>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
}

app.post('/fyll', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    const fdf = lagFDF(data);

    const tmpFDF = path.join(os.tmpdir(), `skade-${Date.now()}.fdf`);
    fs.writeFileSync(tmpFDF, fdf, 'utf8');

    const pdfBuffer = await pdftk
      .input(PDF_MAL)
      .fillForm(tmpFDF)
      .output();

    fs.unlinkSync(tmpFDF);

    const filnavn = `skademelding-${data.date || 'skjema'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filnavn}"`);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Feil:', err.message);
    res.status(500).json({ feil: err.message });
  }
});

app.get('/helse', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kjører på port ${PORT}`));
