const pass = `
	precision mediump float;

	attribute vec4 position;
	attribute vec2 uv;
	attribute vec3 normal;

	uniform mat4 objectToWorld;
	uniform mat4 objectToWorldInvrsTrnsp;
	uniform mat4 worldToCamera;
	uniform mat4 projection;

	varying lowp vec2 vUv;
	varying lowp vec3 vNormal;

	void main() {
		vec4 pos = (projection * worldToCamera * objectToWorld) * position;
		pos /= pos.w;
		vNormal = normalize((objectToWorldInvrsTrnsp * vec4(normal, 0.0)).xyz);
		vUv = uv;
		gl_Position = pos;
	}
`;

const directional = `
	precision lowp float;

	const vec3 lightDirection = normalize(vec3(-1.0, -1.5, -1.5));
	const float intensity = 13.5;

	varying lowp vec2 vUv;
	varying lowp vec3 vNormal;

	void main() {
		float r = vUv.x;
		float g = (1.0 - vUv.x) * vUv.y;
		float b = 1.0 - r - g;
		float ints = dot(vNormal, -lightDirection) * intensity / 3.14;
		gl_FragColor = vec4(vec3(r * ints, g * ints, b * ints), 1.0);
	}
`;

const CANVAS = document.querySelector('#canvas');
const GL = canvas.getContext('webgl');

class Shader {
	constructor(vertexSource, fragmentSource) {
		this.compileShader(vertexSource, fragmentSource);
	}

	compileShaderSource(type, source) {
		let shader = GL.createShader(type);
		GL.shaderSource(shader, source);
		GL.compileShader(shader);
		if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
			alert('Could not compile shader: ' + GL.getShaderInfoLog(shader));
			GL.deleteShader(shader);
			return null;
		}

		return shader;
	}

	compileShader(vertexSource, fragmentSource) {
		let vertexShader = this.compileShaderSource(GL.VERTEX_SHADER, vertexSource);
		let fragmentShader = this.compileShaderSource(GL.FRAGMENT_SHADER, fragmentSource);

		if (vertexShader === null || fragmentShader === null) {
			return;
		}

		this.shaderProgram = GL.createProgram();
		GL.attachShader(this.shaderProgram, vertexShader);
		GL.attachShader(this.shaderProgram, fragmentShader);
		GL.linkProgram(this.shaderProgram);

		if (!GL.getProgramParameter(this.shaderProgram, GL.LINK_STATUS)) {
			alert('Could not link shader program: ' + GL.getProgramInfoLog(this.shaderProgram));
		}
	}

	bind() {
		GL.useProgram(this.shaderProgram);
	}

	getAttribute(attributeName) {
		return GL.getAttribLocation(this.shaderProgram, attributeName);
	}

	getUniform(uniformName) {
		return GL.getUniformLocation(this.shaderProgram, uniformName);
	}
}

class Camera {
	constructor(position, lookAt, cameraUp, resolutionWidth, resolutionHeight, fov, near, far) {
		this.position = vec4.create();
		this.cameraUp = vec4.create();
		this.resolutionWidth = resolutionWidth;
		this.resolutionHeight = resolutionHeight;

		this.position[0] = position[0];
		this.position[1] = position[1];
		this.position[2] = position[2];
		this.position[3] = 1.0;

		this.cameraUp[0] = cameraUp[0];
		this.cameraUp[1] = cameraUp[1];
		this.cameraUp[2] = cameraUp[2];
		this.cameraUp[3] = 0.0;

		this.initializeTransformations(position, lookAt, cameraUp, resolutionWidth / resolutionHeight, fov, near, far);
	}

	initializeTransformations(position, lookAt, up, aspectRatio, fov, near, far) {
		this.cameraTransform = mat4.create();
		this.projectionMatrix = mat4.create();

		mat4.lookAt(this.cameraTransform, position, lookAt, up);
		mat4.perspective(this.projectionMatrix, fov, aspectRatio, near, far);
	}
}

class Vertex {
	constructor(position, uv, normal) {
		this.position = vec4.create();
		this.uv = vec2.create();
		this.normal = vec3.create();

		this.position[0] = position[0];
		this.position[1] = position[1];
		this.position[2] = position[2];
		this.position[3] = position[3];

		this.uv[0] = uv[0];
		this.uv[1] = uv[1];

		this.normal[0] = normal[0];
		this.normal[1] = normal[1];
		this.normal[2] = normal[2];
	}
}

const shader = new Shader(pass, directional);

class Sphere {
	constructor(circles) {
		this.shader = shader;
		this.objectToWorld = mat4.create();
		this.objectToWorldIT = mat4.create();
		this.circles = circles;
		this.createSphere();
		this.createAttributeArrays();
	}

	createSphere() {
		let vertices = [];
		let triangleIndices = [];
		let pos = vec4.create();
		let uv = vec2.create();
		let n = vec3.create();

		for (let i = 0; i < this.circles; ++i) {
			let theta = Math.PI - ((i + 1) * (Math.PI / (this.circles + 1)));
			let cosTheta = Math.cos(theta);
			let sinTheta = Math.sin(theta);

			for (let j = 0; j < this.circles; ++j) {
				let phi = ((2.0 * Math.PI) / this.circles) * j;
				let cosPhi = Math.cos(phi);
				let sinPhi = Math.sin(phi);

				pos[0] = sinTheta * cosPhi;
				pos[1] = sinTheta * sinPhi;
				pos[2] = cosTheta;
				pos[3] = 1.0;

				n[0] = pos[0];
				n[1] = pos[1];
				n[2] = pos[2];

				uv[0] = phi / (2.0 * Math.PI);
				uv[1] = 0.5 + pos[2] / 2;

				vertices.push(new Vertex(pos, uv, n));
			}
		}

		for (let i = 0; i < this.circles - 1; ++i) {
			let startIndex = i * this.circles;

			for (let j = 0; j < this.circles; ++j) {
				let i0 = startIndex + j;
				let i1 = startIndex + ((j + 1) % this.circles);
				let i2 = startIndex + this.circles + j;
				let i3 = startIndex + this.circles + ((j + 1) % this.circles);

				
				triangleIndices.push(i0);
				triangleIndices.push(i1);
				triangleIndices.push(i2);

				triangleIndices.push(i1);
				triangleIndices.push(i3);
				triangleIndices.push(i2);
			}
		}

		let botIndex = vertices.length;
		let topIndex = vertices.length + 1;

		pos[0] = 0.0;
		pos[1] = 0.0;
		pos[2] = -1.0;
		pos[3] = 1.0;

		n[0] = pos[0];
		n[1] = pos[1];
		n[2] = pos[2];

		uv[0] = 0.0;
		uv[1] = 0.0;

		vertices.push(new Vertex(pos, uv, n));

		pos[0] = 0.0;
		pos[1] = 0.0;
		pos[2] = 1.0;
		pos[3] = 1.0;

		n[0] = pos[0];
		n[1] = pos[1];
		n[2] = pos[2];

		uv[0] = 0.0;
		uv[1] = 1.0;

		vertices.push(new Vertex(pos, uv, n));

		let indexStart = (this.circles - 1) * this.circles;
		for (let i = 0; i < this.circles; ++i) {
			triangleIndices.push(botIndex);
			triangleIndices.push((i + 1) % this.circles);
			triangleIndices.push(i);

			triangleIndices.push(topIndex);
			triangleIndices.push(indexStart + i);
			triangleIndices.push(indexStart + ((i + 1) % this.circles));
		}

		console.log(vertices);
		console.log(triangleIndices);

		this.vertexBuffer = this.createVertexBuffer(vertices.map((vertex) => [
			vertex.position[0], vertex.position[1], vertex.position[2], vertex.position[3],
			vertex.uv[0], vertex.uv[1],
			vertex.normal[0], vertex.normal[1], vertex.normal[2]
		]).flat());

		this.indices = triangleIndices.length;
		this.indexBuffer = this.createIndexBuffer(triangleIndices);
	}

	createIndexBuffer(indices) {
		let indexBuffer = GL.createBuffer();
		GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, indexBuffer);
		GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), GL.STATIC_DRAW);
		GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, null);
		return indexBuffer;
	}

	createVertexBuffer(vertices) {
		let vertexBuffer = GL.createBuffer();
		GL.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
		GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(vertices), GL.STATIC_DRAW);
		GL.bindBuffer(GL.ARRAY_BUFFER, null);
		return vertexBuffer;
	}

	createAttributeArrays() {
		GL.bindBuffer(GL.ARRAY_BUFFER, this.vertexBuffer);
		GL.vertexAttribPointer(
			this.shader.getAttribute('position'),
			4,
			GL.FLOAT,
			false,
			9 * 4,
			0);
		GL.enableVertexAttribArray(this.shader.getAttribute('position'));

		GL.vertexAttribPointer(
			this.shader.getAttribute('uv'),
			2,
			GL.FLOAT,
			false,
			9 * 4,
			4 * 4);
		GL.enableVertexAttribArray(this.shader.getAttribute('uv'));

		GL.vertexAttribPointer(
			this.shader.getAttribute('normal'),
			3,
			GL.FLOAT,
			false,
			9 * 4,
			(4 + 2) * 4);
		GL.enableVertexAttribArray(this.shader.getAttribute('normal'));

		GL.bindBuffer(GL.ARRAY_BUFFER, null);
	}

	update(delta) {
		let speed = delta * delta;

		let rotation = mat4.create();
		mat4.rotateZ(rotation, rotation, speed / 1.5 + delta);
		mat4.multiply(this.objectToWorld, this.objectToWorld, rotation);

		rotation = mat4.create();
		mat4.rotateX(rotation, rotation, speed + 0.73 * delta);
		mat4.multiply(this.objectToWorld, this.objectToWorld, rotation);

		rotation = mat4.create();
		mat4.rotateY(rotation, rotation, speed / 2 + 1.35 * delta);
		mat4.multiply(this.objectToWorld, this.objectToWorld, rotation);
	}

	draw(camera) {
		this.shader.bind();
		GL.bindBuffer(GL.ARRAY_BUFFER, this.vertexBuffer);
		GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
		GL.uniformMatrix4fv(
			this.shader.getUniform('projection'),
			false,
			camera.projectionMatrix);
		GL.uniformMatrix4fv(
			this.shader.getUniform('worldToCamera'),
			false,
			camera.cameraTransform);
		GL.uniformMatrix4fv(
			this.shader.getUniform('objectToWorld'),
			false,
			this.objectToWorld);

		mat4.invert(this.objectToWorldIT, this.objectToWorld);
		mat4.transpose(this.objectToWorldIT, this.objectToWorldIT);
		GL.uniformMatrix4fv(
			this.shader.getUniform('objectToWorldInvrsTrnsp'),
			false,
			this.objectToWorldIT);

		GL.drawElements(GL.TRIANGLES, this.indices, GL.UNSIGNED_SHORT, 0);
		GL.bindBuffer(GL.ARRAY_BUFFER, null);
		GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, null);
	}

	dispose() {
		GL.deleteBuffer(this.vertexBuffer);
		GL.deleteBuffer(this.indexBuffer);
	}
}

function main() {
	if (!GL) {
		alert('Error: Could not create GL context');
		return -1;
	}

	resolutionWidth = GL.canvas.clientWidth;
	resolutionHeight = GL.canvas.clientHeight;

	setupGL();
	let cameraPosition = vec3.create();
	let cameraLookAt = vec3.create();
	let cameraUp = vec3.create();

	cameraPosition[0] = 0.0;
	cameraPosition[1] = 0.0;
	cameraPosition[2] = 2.0;

	cameraLookAt[0] = 0.0;
	cameraLookAt[1] = 0.0;
	cameraLookAt[2] = -1.0;

	cameraUp[0] = 0.0;
	cameraUp[1] = 1.0;
	cameraUp[2] = 0.0;

	let camera = new Camera(cameraPosition, cameraLookAt, cameraUp,
		resolutionWidth, resolutionHeight, Math.PI / 2, 0.01, 1000.0);

	render(camera);
}

function setupGL() {
	GL.enable(GL.DEPTH_TEST);
	GL.enable(GL.CULL_FACE);
	GL.cullFace(GL.BACK);
	GL.clearColor(0.0, 0.0, 0.0, 1.0);
	GL.clearDepth(1.0);
}

function render(camera) {
	let quality = 3;
	let sphere = new Sphere(Math.pow(2, quality));
	let timeNow = Date.now();
	let timePrev = timeNow;
	let delta = 0.0;
	let cameraMoveDirection = vec3.create();
	let updateSphere = false;

	document.addEventListener('keyup', (e) => {
		if (e.code === "ArrowUp") {
			quality++;
		}
		else if (e.code === "ArrowDown") {
			quality--;
		}

		quality = Math.max(quality, 2);
		updateSphere = true;;
	});

	function draw() {
		if (updateSphere) {
			sphere.dispose();
			sphere = new Sphere(Math.pow(2, quality));
			timeNow = Date.now();
			timePrev = timeNow;
			delta = 0.0;
			updateSphere = false;
		}

		timeNow = Date.now();
		delta = (timeNow - timePrev) / 1000.0;
		timePrev = timeNow;
		sphere.update(delta);

		GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
		sphere.draw(camera);
		requestAnimationFrame(draw);
	}

	requestAnimationFrame(draw);
}

main();
