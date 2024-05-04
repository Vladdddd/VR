"use strict";

let gl;
let surface;
let shProgram;
let spaceball;
let cam;

let video;
let vTexture;
let vModel;

const vModelBufferData = [-1, -1, 0, 1, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 1, 0];
const vModelTBufferData = [1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0];

let x1 = -1;
let x2 = 1;
let y1 = -1;
let y2 = 1;
let lines = 0;

const calcStepX = (x2 - x1) / 20;
const calcStepY = (y2 - y1) / 20;
const { PI, tan } = Math
let convergence = 25, separation = 1, fov = 45, near_clipping = 1;

function deg2rad(angle) {
  return (angle * Math.PI) / 180;
}

function createVideo() {
  const video = document.createElement('video');
  video.setAttribute('autoplay', true);
  
  navigator.getUserMedia(
    { video: true, audio: false }, 
    (stream) => {
      video.srcObject = stream;
    },
    (e) => {
      console.error(`The following error occurred: ${e.name}`);
    }
  );

  return video;
}
function createVTexture() {
  const vTexture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, vTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return vTexture;
}

class StereoCamera {
  constructor(
      Convergence,
      EyeSeparation,
      AspectRatio,
      FOV,
      NearClippingDistance,
      FarClippingDistance
  ) {
      this.mConvergence = Convergence;
      this.mEyeSeparation = EyeSeparation;
      this.mAspectRatio = AspectRatio;
      this.mFOV = FOV * PI / 180.0;
      this.mNearClippingDistance = NearClippingDistance;
      this.mFarClippingDistance = FarClippingDistance;
  }
  ApplyLeftFrustum() {
  let top, bottom, left, right;
      
  top = this.mNearClippingDistance * tan(this.mFOV / 2);
      bottom = -top;

      let a = this.mAspectRatio * tan(this.mFOV / 2) * this.mConvergence;
      let b = a - this.mEyeSeparation / 2;
      let c = a + this.mEyeSeparation / 2;

      left = -b * this.mNearClippingDistance / this.mConvergence;
      right = c * this.mNearClippingDistance / this.mConvergence;

      this.projection = m4.frustum(left, right, bottom, top,
      this.mNearClippingDistance, this.mFarClippingDistance);
      this.modelView = m4.translation(this.mEyeSeparation / 2, 0.0, 0.0);

  }
  ApplyRightFrustum() {
  let top, bottom, left, right;
  
      top = this.mNearClippingDistance * tan(this.mFOV / 2);
      bottom = -top;

      let a = this.mAspectRatio * tan(this.mFOV / 2) * this.mConvergence;
      let b = a - this.mEyeSeparation / 2;
      let c = a + this.mEyeSeparation / 2;

      left = -c * this.mNearClippingDistance / this.mConvergence;
      right = b * this.mNearClippingDistance / this.mConvergence;

      this.projection = m4.frustum(left, right, bottom, top,
      this.mNearClippingDistance, this.mFarClippingDistance);
      this.modelView = m4.translation(-this.mEyeSeparation / 2, 0.0, 0.0);
      
  }
}

function Model(name) {
  this.name = name;
  this.iVertexBuffer = gl.createBuffer();
  this.count = 0;
  this.iVertexTextureBuffer = gl.createBuffer();

  this.BufferData = function (vertices, normals) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    this.count = vertices.length / 3;
  };

  this.Draw = function () {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);

    gl.drawArrays(gl.TRIANGLE_STRIP - 1, 0, this.count);
  };
  
  this.DrawLines = function () {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);

    let n = this.count / lines;
    for (let i = 0; i < lines; i++) {
      gl.drawArrays(gl.LINE_STRIP - 2, n * i, n);
    }
  }

  this.TextureBufferData = function (vertices) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexTextureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  }

  this.DrawTextured = function () {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexTextureBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertexTexture, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertexTexture);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}

function ShaderProgram(name, program) {
  this.name = name;
  this.prog = program;

  this.iAttribVertex = -1;
  this.iColor = -1;
  this.iModelViewProjectionMatrix = -1;

  this.Use = function () {
    gl.useProgram(this.prog);
  };
}

function draw(animate=false) {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  let projection = m4.perspective(Math.PI / 8, 1, 8, 12);
  let modelView = spaceball.getViewMatrix();

  let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.7);
  let translateToPointZero = m4.translation(0, 0, -5);

  let matAccum0 = m4.multiply(rotateToPointZero, modelView);
  let matAccum1 = m4.multiply(translateToPointZero, matAccum0);

  gl.uniform1f(shProgram.iT, true);
  gl.bindTexture(gl.TEXTURE_2D, vTexture);
  gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
  );
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, m4.identity());
  vModel.DrawTextured();
  gl.clear(gl.DEPTH_BUFFER_BIT)
  gl.uniform1f(shProgram.iT, false);

  let modelViewProjection = m4.multiply(projection, matAccum1);
	
  cam.ApplyLeftFrustum();
    
	modelViewProjection = m4.multiply(cam.projection, m4.multiply(cam.modelView, matAccum1));
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  gl.colorMask(true, false, false, false);
    
	gl.uniform4fv(shProgram.iColor, [1, 1, 0, 1]);
	surface.Draw();
    
	gl.uniform4fv(shProgram.iColor, [0, 0, 1, 1]);
	surface.DrawLines();

  gl.clear(gl.DEPTH_BUFFER_BIT);

  cam.ApplyRightFrustum();
	
  modelViewProjection = m4.multiply(cam.projection, m4.multiply(cam.modelView, matAccum1));
  gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
  gl.colorMask(false, true, true, false);
    
	gl.uniform4fv(shProgram.iColor, [1, 1, 0, 1]);
  surface.Draw();
    
	gl.uniform4fv(shProgram.iColor, [0, 0, 1, 1]);
  surface.DrawLines();

  gl.colorMask(true, true, true, true);

  if (animate) {
    window.requestAnimationFrame(()=>draw(true));
  }
}

function CreateShoeSurfaceData() {
  let vertexList = [];

  for (let j = x1; j < x2 + calcStepX; j += calcStepX) {
	lines = 0;
    for (let i = y1; i < y2 + calcStepY; i += calcStepY) {
      vertexList.push(i, j, calculateZ(i, j));
      vertexList.push(i + calcStepY, j, calculateZ(i + calcStepY, j));
      vertexList.push(i, j + calcStepX, calculateZ(i, j + calcStepX));
      vertexList.push(i, j + calcStepX, calculateZ(i, j + calcStepX));
      vertexList.push(i + calcStepY, j, calculateZ(i + calcStepY, j));
      vertexList.push(i + calcStepY, j + calcStepX, calculateZ(i + calcStepY, j + calcStepX));
    }
	lines++;
  }
  return vertexList;
}

let calculateZ = function (x, y) {
  return (x * x * x) / 3 - (y * y) / 2;
};

function initGL() {
  let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  shProgram = new ShaderProgram("Basic", prog);
  shProgram.Use();

  shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
  shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
  shProgram.iColor = gl.getUniformLocation(prog, "color");
  shProgram.iAttribVertexTexture = gl.getAttribLocation(prog, "textureCoords");
  shProgram.iT = gl.getUniformLocation(prog, "textured");

  surface = new Model("Surface");
  const surfaceData = CreateShoeSurfaceData();
  surface.BufferData(surfaceData);

  surface.TextureBufferData(CreateShoeSurfaceData(),);
  vModel = new Model('Video');
  vModel.BufferData(vModelBufferData);
  vModel.TextureBufferData(vModelTBufferData);

  gl.enable(gl.DEPTH_TEST);
}

function createProgram(gl, vShader, fShader) {
  let vsh = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vsh, vShader);
  gl.compileShader(vsh);
  if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
  }
  let fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fsh, fShader);
  gl.compileShader(fsh);
  if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

function init() {
  video = createVideo();
  let canvas;

  document.getElementById('convergence').addEventListener("change", () => {
    convergence = parseFloat(document.getElementById('convergence').value);
    cam.mConvergence = convergence;
    draw();
  })

  document.getElementById('separation').addEventListener("change", () => {
    separation = parseFloat(document.getElementById('separation').value);
    cam.mEyeSeparation = separation;
    draw();
  })

  document.getElementById('fov').addEventListener("change", () => {
    fov = deg2rad(parseFloat(document.getElementById('fov').value));
    cam.mFOV = fov;
    draw();
  })

  document.getElementById('near_clipping').addEventListener("change", () => {
    near_clipping = parseFloat(document.getElementById('near_clipping').value);
    cam.mNearClippingDistance = near_clipping;
    draw();
  })

  try {
    canvas = document.getElementById("webglcanvas");
    gl = canvas.getContext("webgl");
    if (!gl) {
      throw "Browser does not support WebGL";
    }
  } catch (e) {
    document.getElementById("canvas-holder").innerHTML = "<p>Sorry, could not get a WebGL graphics context.</p>";
    return;
  }
  try {
    initGL();
  } catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
    return;
  }

  try {
        cam = new StereoCamera(
            convergence,    
            separation,       
            1,     
            fov,       
            near_clipping,       
            20.0);   
        initGL();  
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

  vTexture = createVTexture();
  spaceball = new TrackballRotator(canvas, draw, 0);

  draw(true);
}