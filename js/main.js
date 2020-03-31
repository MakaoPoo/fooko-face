const video = document.getElementById("video");
// const canvas = document.getElementById("canvas");
let app;
let fooko = null;

$(async function() {
  app = new PIXI.Application({
    view: document.getElementById("fooko"),
    width: 680,
    height: 680,
    transparent: true,
  });

  app.loader.add('fooko', 'resource/fooko.json')
  .load(onAssetsLoaded);

  // Webカメラ初期化
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: 400,
      height: 400
    }
  });

  try {
    video.srcObject = stream;
  } catch (err) {
    video.src = window.URL.createObjectURL(stream);
  }
  // (1)モデル読み込み　※フォルダを指定
  await faceapi.nets.tinyFaceDetector.load("models/");
  await faceapi.nets.faceLandmark68Net.load("models/");
});

const onPlay = () => {
  const inputSize = 160; // 認識対象のサイズ
  const scoreThreshold = 0.2; // 数値が高いほど精度が高くなる（〜0.9）
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize,
    scoreThreshold
  })

  setInterval(async () => {
    const result = await faceapi.detectSingleFace(
      video,
      options
    )
    .withFaceLandmarks();

    if (result) {
      const mouthPos = result.landmarks.getMouth();
      const nosePos = result.landmarks.getNose()
      const outlinePos = result.landmarks.getJawOutline()

      // canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      // faceapi.draw.drawDetections(canvas, resizedDetections);
      // faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
      // drawDot(canvas, mouthPos[12]);
      // drawDot(canvas, mouthPos[16]);
      // drawDot(canvas, mouthPos[14]);
      // drawDot(canvas, mouthPos[18]);
      // drawDot(canvas, outlinePos[0]);
      // drawDot(canvas, outlinePos[8]);
      // drawDot(canvas, getVecCenter(nosePos[0], getVecCenter(outlinePos[0], outlinePos[16])));
      // drawDot(canvas, outlinePos[8]);

      const mouthHLength = getVecLength(mouthPos[12], mouthPos[16]);
      const mouthVLength = getVecLength(mouthPos[14], mouthPos[18]);
      const faceHLength = getVecLength(outlinePos[0], outlinePos[16]);
      const faceVLength = getVecLength(outlinePos[0], getVecCenter(nosePos[0], getVecCenter(outlinePos[0], outlinePos[16])));
      const noseFaceLength = getVecLength(nosePos[0], getVecCenter(outlinePos[0], outlinePos[16]));

      const mouthVRate = (mouthVLength / faceVLength) * 100;
      let mouthHRate = (mouthHLength / faceHLength) * 100;

      const mouthVVal = getRateVal(mouthVRate, 2, 16) + getRateVal(mouthVRate, 16, 22) * 0.9 - getRateVal(mouthHRate, 26, 32) * 0.3;
      const mouthHVal = 0.5 + getRateVal(mouthHRate, 26, 29) * 0.6 + getRateVal(mouthHRate, 29, 35) * 1.0 + getRateVal(mouthVRate, 14, 22) * 0.2;

      // console.log("V: " + mouthVRate);
      // console.log("H: " + mouthHRate);
      // console.log("N: " + Math.abs(nosePos[0].x - getVecCenter(outlinePos[0], outlinePos[16]).x));
      // console.log("");

      if(fooko) {
        const mouthBone = fooko.skeleton.findBone("mouth");
        let scaleX = mouthHVal;

        histData.addHist("mouthScaleX", scaleX, 8);
        mouthBone.scaleY = histData.getHistAve("mouthScaleX");

        let scaleY = mouthVVal;
        histData.addHist("mouthscaleY", scaleY, 8);
        scaleY = histData.getHistAve("mouthscaleY");

        if(scaleY < 0.1) {
          fooko.skeleton.setAttachment("mouth", "mouth-close");
          scaleY = 1;
        } else {
          fooko.skeleton.setAttachment("mouth", "mouth-open");
        }
        mouthBone.scaleX = scaleY;

        const faceRot = getVecRot(outlinePos[0], outlinePos[16]);
        const faceBone = fooko.skeleton.findBone("face");
        let faceDeg = getDeg(faceRot);
        if(faceDeg > 15) { faceDeg = 15; }
        if(faceDeg < -15) { faceDeg = -15; }

        histData.addHist("faceDeg", faceDeg, 15);
        faceBone.rotation = histData.getHistAve("faceDeg");

        let bone = fooko.skeleton.findBone("back-hair");
        let deg = (bone.getWorldRotationX() - 90) * 0.02;
        deg -= degSpeed * 0.1;
        degSpeed += deg;

        bone = fooko.skeleton.findBone("back-hair");
        bone.rotation += degSpeed;

        bone = fooko.skeleton.findBone("right-hair");
        bone.rotation += degSpeed;

        bone = fooko.skeleton.findBone("left-hair");
        bone.rotation += degSpeed;

        bone = fooko.skeleton.findBone("center-hair");
        bone.rotation += degSpeed;

        time += 2;

        const eyeTime = time % 400;
        const eyeScale = (eyeTime <= 14)? ((eyeTime-7)/7)**2 : 1;

        bone = fooko.skeleton.findBone("left-eye");
        bone.scaleX = eyeScale;
        bone = fooko.skeleton.findBone("right-eye");
        bone.scaleX = eyeScale;

      }

      // message.textContent = "認識されてます"
    } else {
      // message.textContent = "認識されていません"
    }
  }, 10);

  renderLoop();
}

const renderLoop = function() {
  fooko.update();

  requestAnimationFrame(renderLoop);
}

const getRateVal = function(rate, min, max) {
  if(rate <= min) {
    return 0;
  }
  if(rate >= max) {
    return 1;
  }

  return (rate - min) / (max - min);
}

let degSpeed = 0;

class HistData {
  constructor() {
    this.histList = {};
  }

  addHist(name, data, max) {
    if(!(name in this.histList)) {
      this.histList[name] = [];
    }

    this.histList[name].push(data);
    if(this.histList[name].length >= max) {
      this.histList[name].shift();
    }
  }

  getHistAve(name) {
    let sum = 0;
    let indexSum = 0;
    for(const index in this.histList[name]) {
      const data = this.histList[name][index];
      const weight = (index + 1) / this.histList[name].length;
      indexSum += weight;
      sum += data * weight;
    }

    return sum / indexSum;
  }
}

const histData = new HistData();

const drawDot = function(canvas, pos) {
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#ff0000";
  ctx.fill() ;
}

const getVecLength = function(pos1, pos2) {
  const vec = {
    x: pos2.x - pos1.x,
    y: pos2.y - pos1.y,
  }
  const length = Math.sqrt(vec.x**2 + vec.y**2);
  return length;
}

const getVecCenter = function(pos1, pos2) {
  const vec = {
    x: (pos2.x + pos1.x) / 2,
    y: (pos2.y + pos1.y) / 2,
  }
  return vec;
}

const getVecRot = function(pos1, pos2) {
  const rot = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
  return rot
}

function onAssetsLoaded(loader, res) {
  fooko = new PIXI.spine.Spine(res.fooko.spineData);
  fooko.autoUpdate = false;

  fooko.position.set(
    340,
    680,
  );

  app.stage.addChild(fooko);
  fooko.update(0);
}

let time = 0;

const getRad = function(deg) {
  return deg * Math.PI / 180;
}
const getDeg = function(rad) {
  return rad * 180 / Math.PI;
}

$('#faceapi').on('click', function() {
  $(this).toggleClass("show");
});
