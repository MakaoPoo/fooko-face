const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
let app;
let fooko = null;

$(async function() {
  app = new PIXI.Application({
    view: document.getElementById("fooko"),
    width: 1000,
    height: 1000,
    transparent: true,
  });

  app.stop();
  app.loader.add('fooko', '/resource/fooko.json')
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
  const message = document.getElementById('message')
  const inputSize = 512; // 認識対象のサイズ
  const scoreThreshold = 0.3; // 数値が高いほど精度が高くなる（〜0.9）
  // (2)オプション設定
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize,
    scoreThreshold
  })
  const detectInterval = setInterval(async () => {
    // (3)顔認識処理
    const result = await faceapi.detectSingleFace(
      video,
      options
    )
    .withFaceLandmarks()

    if (result) {
      const resizedDetections = faceapi.resizeResults(result, {
        width: 400,
        height: 400
      });

      const mouthPos = resizedDetections.landmarks.getMouth();
      const outlinePos = resizedDetections.landmarks.getJawOutline()
      // console.log(outlinePos);

      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
      // drawDot(canvas, mouthPos[12]);
      // drawDot(canvas, mouthPos[16]);
      // drawDot(canvas, mouthPos[14]);
      // drawDot(canvas, mouthPos[18]);
      // drawDot(canvas, outlinePos[0]);
      // drawDot(canvas, outlinePos[8]);
      // drawDot(canvas, outlinePos[16]);

      const mouthHLength = getVecLength(mouthPos[12], mouthPos[16]);
      const mouthVLength = getVecLength(mouthPos[14], mouthPos[18]);
      const faceHLength = getVecLength(outlinePos[0], outlinePos[16]);

      let mouthVecRate = ((mouthHLength / mouthVLength) - 0.5) ** 1.5;

      if(mouthVecRate > 2) {
        mouthVecRate = 2;
      }
      if(mouthVecRate < 0.5) {
        mouthVecRate = 0.5;
      }

      if(fooko) {
        const mouthBone = fooko.skeleton.findBone("mouth");
        let scaleY = ((120/32) * (mouthHLength / faceHLength))**2.5;
        if(scaleY > 2) {
          scaleY = 2;
        }
        histData.addHist("mouthScaleY", scaleY, 5);
        mouthBone.scaleY = histData.getHistAve("mouthScaleY");
        if(mouthVLength < 3) {
          fooko.skeleton.setAttachment("mouth", "mouth-close");
          mouthBone.scaleX = 1;
        } else {
          fooko.skeleton.setAttachment("mouth", "mouth-open");
          let scaleX = (mouthVLength-3) / 11;
          if(scaleX > 2) {
            scaleX = 2;
          }
          histData.addHist("mouthscaleX", scaleX, 5);
          mouthBone.scaleX = histData.getHistAve("mouthscaleX");
        }

        const faceRot = getVecRot(outlinePos[0], outlinePos[16]);
        const faceBone = fooko.skeleton.findBone("face");
        let deg = getDeg(faceRot);
        if(deg > 20) { deg = 20; }
        if(deg < -20) { deg = -20; }

        histData.addHist("faceDeg", deg, 15);
        faceBone.rotation = histData.getHistAve("faceDeg");
      }

      // message.textContent = "認識されてます"
    } else {
      // message.textContent = "認識されていません"
    }
  }, 16);

  app.ticker.add(() => {
    time += 2;

    let deg = Math.cos(getRad(time)) * 0.08;

    let bone;

    bone = fooko.skeleton.findBone("back-hair");
    deg += (bone.getWorldRotationX() - 90) * 0.02;
    deg -= degSpeed * 0.1;

    degSpeed += deg;
    bone.rotation += degSpeed;

    bone = fooko.skeleton.findBone("right-hair");
    bone.rotation += degSpeed;

    bone = fooko.skeleton.findBone("left-hair");
    bone.rotation += degSpeed;

    bone = fooko.skeleton.findBone("center-hair");
    bone.rotation += degSpeed;

    const eyeTime = time % 400;
    const eyeScale = (eyeTime <= 14)? ((eyeTime-7)/7)**2 : 1;

    bone = fooko.skeleton.findBone("left-eye");
    bone.scaleX = eyeScale;
    bone = fooko.skeleton.findBone("right-eye");
    bone.scaleX = eyeScale;

    fooko.update(0.016666); // HARDCODED FRAMERATE!
  });
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

const getVecRot = function(pos1, pos2) {
  const rot = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
  return rot
}

function onAssetsLoaded(loader, res) {
  fooko = new PIXI.spine.Spine(res.fooko.spineData);
  fooko.autoUpdate = true;

  const scale = 1.5;
  fooko.scale.set(scale, scale);
  fooko.position.set(
    500,
    1000,
  );

  app.stage.addChild(fooko);
  app.start();
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
