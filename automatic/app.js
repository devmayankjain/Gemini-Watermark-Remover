"use strict";

/*
============================================================
SPRINT 14.2
GENERIC VISUAL REGION DETECTOR

Browser only
No OWL-ViT
No Transformers.js
No API
No external model

Pipeline:

Image
  ↓
Multi-scale analysis
  ↓
Gradient + local contrast
  ↓
Visual region proposals
  ↓
Region evidence
  ↓
Text / UI / photo penalties
  ↓
Local refinement
  ↓
Non Maximum Suppression
  ↓
Logo candidates
============================================================
*/


/* =========================================================
   DOM
========================================================= */

const imageInput = document.getElementById("imageInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");

const canvas = document.getElementById("canvas");

const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});

const statusEl = document.getElementById("status");

const progressBox =
    document.getElementById("progressBox");

const progressBar =
    document.getElementById("progressBar");

const progressText =
    document.getElementById("progressText");

const progressNumber =
    document.getElementById("progressNumber");

const previewSection =
    document.getElementById("previewSection");

const resultsSection =
    document.getElementById("resultsSection");

const resultsEl =
    document.getElementById("results");

const dimensionsEl =
    document.getElementById("dimensions");

const resultCountEl =
    document.getElementById("resultCount");


/* =========================================================
   STATE
========================================================= */

let sourceImage = null;

let sourceWidth = 0;
let sourceHeight = 0;

let analysisCanvas = null;
let analysisCtx = null;

let analysisWidth = 0;
let analysisHeight = 0;


/* =========================================================
   CONFIG
========================================================= */

const MAX_ANALYSIS_WIDTH = 1000;

const MAX_RESULTS = 8;

const MIN_SCORE = 38;

const NMS_IOU = 0.40;


/*
 * Region scan sizes.

 * These are percentages of the image.
 * This makes detection independent of
 * logo position.
 */

const WINDOW_SIZES = [
    0.035,
    0.05,
    0.07,
    0.10,
    0.14,
    0.20,
    0.28
];


/* =========================================================
   STATUS
========================================================= */

function setStatus(text, type = "") {

    statusEl.textContent = text;

    statusEl.className = "status";

    if (type) {
        statusEl.classList.add(type);
    }
}


/* =========================================================
   PROGRESS
========================================================= */

function setProgress(value, text) {

    value = Math.max(
        0,
        Math.min(100, value)
    );

    progressBar.style.width =
        `${value}%`;

    progressNumber.textContent =
        `${Math.round(value)}%`;

    progressText.textContent =
        text;
}


/* =========================================================
   IMAGE INPUT
========================================================= */

imageInput.addEventListener(
    "change",
    function () {

        const file =
            imageInput.files?.[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {

            setStatus(
                "Please select an image",
                "error"
            );

            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            function (event) {

                const img =
                    new Image();

                img.onload =
                    function () {

                        sourceImage = img;

                        sourceWidth =
                            img.naturalWidth;

                        sourceHeight =
                            img.naturalHeight;

                        dimensionsEl.textContent =
                            `${sourceWidth} × ${sourceHeight}`;

                        prepareAnalysisCanvas();

                        drawOriginal();

                        analyzeBtn.disabled =
                            false;

                        previewSection.classList.remove(
                            "hidden"
                        );

                        setStatus(
                            "Image ready",
                            "success"
                        );
                    };

                img.onerror =
                    function () {

                        setStatus(
                            "Unable to read image",
                            "error"
                        );
                    };

                img.src =
                    event.target.result;
            };

        reader.readAsDataURL(file);
    }
);


/* =========================================================
   ANALYSIS CANVAS
========================================================= */

function prepareAnalysisCanvas() {

    const scale =
        Math.min(
            1,
            MAX_ANALYSIS_WIDTH /
            sourceWidth
        );

    analysisWidth =
        Math.max(
            1,
            Math.round(
                sourceWidth * scale
            )
        );

    analysisHeight =
        Math.max(
            1,
            Math.round(
                sourceHeight * scale
            )
        );

    analysisCanvas =
        document.createElement("canvas");

    analysisCanvas.width =
        analysisWidth;

    analysisCanvas.height =
        analysisHeight;

    analysisCtx =
        analysisCanvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    analysisCtx.drawImage(
        sourceImage,
        0,
        0,
        analysisWidth,
        analysisHeight
    );
}


/* =========================================================
   DRAW ORIGINAL
========================================================= */

function drawOriginal() {

    if (!sourceImage) {
        return;
    }

    const scale =
        Math.min(
            1,
            MAX_ANALYSIS_WIDTH /
            sourceWidth
        );

    canvas.width =
        Math.round(
            sourceWidth * scale
        );

    canvas.height =
        Math.round(
            sourceHeight * scale
        );

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.drawImage(
        sourceImage,
        0,
        0,
        canvas.width,
        canvas.height
    );
}


/* =========================================================
   MAIN ANALYSIS
========================================================= */

analyzeBtn.addEventListener(
    "click",
    async function () {

        if (!sourceImage) {
            return;
        }

        analyzeBtn.disabled = true;

        progressBox.classList.remove(
            "hidden"
        );

        resultsSection.classList.add(
            "hidden"
        );

        setProgress(
            2,
            "Starting visual analysis..."
        );

        setStatus(
            "Analyzing image...",
            "loading"
        );

        try {

            const candidates =
                await detectVisualRegions();

            const finalCandidates =
                nonMaximumSuppression(
                    candidates
                )
                .slice(
                    0,
                    MAX_RESULTS
                );

            window.logoCandidates =
                finalCandidates;

            drawCandidates(
                finalCandidates
            );

            renderResults(
                finalCandidates
            );

            setProgress(
                100,
                "Detection complete"
            );

            if (finalCandidates.length) {

                setStatus(
                    `${finalCandidates.length} visual candidates found`,
                    "success"
                );

            } else {

                setStatus(
                    "No strong visual candidate found",
                    "error"
                );
            }

        } catch (error) {

            console.error(
                "SPRINT 14.2 ERROR:",
                error
            );

            setStatus(
                "Detection failed. Check console.",
                "error"
            );
        }

        analyzeBtn.disabled = false;
    }
);


/* =========================================================
   DETECTOR
========================================================= */

async function detectVisualRegions() {

    const imageData =
        analysisCtx.getImageData(
            0,
            0,
            analysisWidth,
            analysisHeight
        );

    setProgress(
        8,
        "Building visual features..."
    );

    const gray =
        createGrayMap(
            imageData
        );

    const blurred =
        blurGray(
            gray,
            analysisWidth,
            analysisHeight
        );

    setProgress(
        20,
        "Analyzing visual structure..."
    );

    const gradient =
        createGradientMap(
            blurred,
            analysisWidth,
            analysisHeight
        );

    const integral =
        createIntegralImage(
            gray,
            analysisWidth,
            analysisHeight
        );

    const gradientIntegral =
        createIntegralImage(
            gradient,
            analysisWidth,
            analysisHeight
        );

    const candidates = [];

    /*
     * Multi-scale sliding windows.
     */

    for (
        let s = 0;
        s < WINDOW_SIZES.length;
        s++
    ) {

        const sizeRatio =
            WINDOW_SIZES[s];

        const base =
            Math.min(
                analysisWidth,
                analysisHeight
            );

        const windowSize =
            Math.max(
                20,
                Math.round(
                    base * sizeRatio
                )
            );

        /*
         * We evaluate both compact and
         * horizontal shapes.
         */

        const shapes = [

            {
                w: windowSize,
                h: windowSize
            },

            {
                w: Math.round(
                    windowSize * 1.5
                ),
                h: windowSize
            },

            {
                w: windowSize,
                h: Math.round(
                    windowSize * 1.5
                )
            }

        ];

        for (
            const shape of shapes
        ) {

            const step =
                Math.max(
                    8,
                    Math.round(
                        windowSize * 0.30
                    )
                );

            for (
                let y = 0;
                y <=
                analysisHeight -
                shape.h;
                y += step
            ) {

                for (
                    let x = 0;
                    x <=
                    analysisWidth -
                    shape.w;
                    x += step
                ) {

                    const region = {
                        x,
                        y,
                        width: shape.w,
                        height: shape.h
                    };

                    const evidence =
                        evaluateRegion(
                            region,
                            imageData,
                            gray,
                            gradient,
                            integral,
                            gradientIntegral
                        );

                    const score =
                        scoreRegion(
                            evidence,
                            region
                        );

                    if (
                        score >=
                        MIN_SCORE
                    ) {

                        candidates.push({

                            ...region,

                            score,

                            evidence
                        });
                    }
                }
            }
        }

        setProgress(
            20 +
            (
                (s + 1) /
                WINDOW_SIZES.length
            ) * 65,

            `Scanning visual scale ${s + 1} / ${WINDOW_SIZES.length}`
        );

        await browserYield();
    }

    setProgress(
        88,
        "Refining strongest regions..."
    );

    /*
     * Only refine the strongest candidates.
     */

    candidates.sort(
        (a, b) =>
            b.score -
            a.score
    );

    const strongest =
        candidates.slice(
            0,
            80
        );

    const refined = [];

    for (
        let i = 0;
        i < strongest.length;
        i++
    ) {

        refined.push(
            refineRegion(
                strongest[i],
                imageData,
                gray,
                gradient,
                integral,
                gradientIntegral
            )
        );

        if (
            i % 10 === 0
        ) {
            await browserYield();
        }
    }

    return refined;
}


/* =========================================================
   GRAYSCALE
========================================================= */

function createGrayMap(imageData) {

    const data =
        imageData.data;

    const gray =
        new Float32Array(
            imageData.width *
            imageData.height
        );

    for (
        let i = 0,
            p = 0;
        i < gray.length;
        i++,
        p += 4
    ) {

        gray[i] =
            data[p] * 0.299 +
            data[p + 1] * 0.587 +
            data[p + 2] * 0.114;
    }

    return gray;
}


/* =========================================================
   BLUR
========================================================= */

function blurGray(
    gray,
    width,
    height
) {

    const result =
        new Float32Array(
            gray.length
        );

    /*
     * Very cheap 3x3 blur.
     */

    for (
        let y = 1;
        y < height - 1;
        y++
    ) {

        for (
            let x = 1;
            x < width - 1;
            x++
        ) {

            const i =
                y * width + x;

            result[i] =
                (
                    gray[i - width - 1] +
                    gray[i - width] +
                    gray[i - width + 1] +

                    gray[i - 1] +
                    gray[i] +
                    gray[i + 1] +

                    gray[i + width - 1] +
                    gray[i + width] +
                    gray[i + width + 1]
                ) / 9;
        }
    }

    return result;
}


/* =========================================================
   GRADIENT
========================================================= */

function createGradientMap(
    gray,
    width,
    height
) {

    const gradient =
        new Float32Array(
            gray.length
        );

    for (
        let y = 1;
        y < height - 1;
        y++
    ) {

        for (
            let x = 1;
            x < width - 1;
            x++
        ) {

            const i =
                y * width + x;

            const gx =
                gray[i + 1] -
                gray[i - 1];

            const gy =
                gray[i + width] -
                gray[i - width];

            gradient[i] =
                Math.sqrt(
                    gx * gx +
                    gy * gy
                );
        }
    }

    return gradient;
}


/* =========================================================
   INTEGRAL IMAGE
========================================================= */

function createIntegralImage(
    data,
    width,
    height
) {

    const integral =
        new Float64Array(
            (width + 1) *
            (height + 1)
        );

    for (
        let y = 1;
        y <= height;
        y++
    ) {

        let rowSum = 0;

        for (
            let x = 1;
            x <= width;
            x++
        ) {

            rowSum +=
                data[
                    (y - 1) *
                    width +
                    (x - 1)
                ];

            integral[
                y * (width + 1) + x
            ] =
                integral[
                    (y - 1) *
                    (width + 1) +
                    x
                ] +
                rowSum;
        }
    }

    return integral;
}


/* =========================================================
   AREA SUM
========================================================= */

function areaSum(
    integral,
    width,
    x,
    y,
    w,
    h
) {

    const stride =
        width + 1;

    const x0 =
        Math.max(
            0,
            Math.floor(x)
        );

    const y0 =
        Math.max(
            0,
            Math.floor(y)
        );

    const x1 =
        Math.min(
            width,
            Math.ceil(
                x + w
            )
        );

    const y1 =
        Math.min(
            Math.floor(
                integral.length /
                stride
            ) - 1,
            Math.ceil(
                y + h
            )
        );

    if (
        x1 <= x0 ||
        y1 <= y0
    ) {
        return 0;
    }

    return (
        integral[
            y1 * stride + x1
        ] -

        integral[
            y0 * stride + x1
        ] -

        integral[
            y1 * stride + x0
        ] +

        integral[
            y0 * stride + x0
        ]
    );
}


/* =========================================================
   REGION EVALUATION
========================================================= */

function evaluateRegion(
    region,
    imageData,
    gray,
    gradient,
    integral,
    gradientIntegral
) {

    const width =
        analysisWidth;

    const height =
        analysisHeight;

    const area =
        Math.max(
            1,
            region.width *
            region.height
        );

    const mean =
        areaSum(
            integral,
            width,
            region.x,
            region.y,
            region.width,
            region.height
        ) /
        area;

    const gradientMean =
        areaSum(
            gradientIntegral,
            width,
            region.x,
            region.y,
            region.width,
            region.height
        ) /
        area;

    /*
     * Border/background contrast.
     */

    const border =
        getBorderStats(
            gray,
            region
        );

    /*
     * Colorfulness.
     */

    const colorfulness =
        calculateColorfulness(
            imageData,
            region
        );

    /*
     * Variance.
     */

    const variance =
        calculateVariance(
            gray,
            region,
            mean
        );

    /*
     * Edge distribution.

     * Logos tend to have structure distributed
     * through the region rather than one huge
     * edge on one side.
     */

    const edgeDistribution =
        calculateEdgeDistribution(
            gradient,
            region
        );

    /*
     * Interior/background difference.
     */

    const separation =
        Math.abs(
            mean -
            border.mean
        );

    /*
     * Texture penalty.

     * Very noisy photographic regions
     * should score lower.
     */

    const texture =
        Math.sqrt(
            Math.max(
                0,
                variance
            )
        );

    /*
     * UI detection.
     */

    const uiPenalty =
        calculateUIPenalty(
            region,
            gradientMean,
            edgeDistribution,
            border
        );

    /*
     * Text detection.
     */

    const textPenalty =
        calculateTextPenalty(
            region,
            gradientMean,
            edgeDistribution
        );

    /*
     * Photo detection.
     */

    const photoPenalty =
        calculatePhotoPenalty(
            texture,
            gradientMean,
            colorfulness
        );

    return {

        mean,

        gradientMean,

        variance,

        texture,

        colorfulness,

        separation,

        edgeDistribution,

        borderContrast:
            border.contrast,

        textPenalty,

        uiPenalty,

        photoPenalty
    };
}


/* =========================================================
   BORDER STATS
========================================================= */

function getBorderStats(
    gray,
    region
) {

    const margin =
        Math.max(
            3,
            Math.round(
                Math.min(
                    region.width,
                    region.height
                ) * 0.20
            )
        );

    const samples = [];

    const top =
        averageGray(
            gray,
            region.x,
            region.y - margin,
            region.width,
            margin
        );

    const bottom =
        averageGray(
            gray,
            region.x,
            region.y + region.height,
            region.width,
            margin
        );

    const left =
        averageGray(
            gray,
            region.x - margin,
            region.y,
            margin,
            region.height
        );

    const right =
        averageGray(
            gray,
            region.x + region.width,
            region.y,
            margin,
            region.height
        );

    if (Number.isFinite(top))
        samples.push(top);

    if (Number.isFinite(bottom))
        samples.push(bottom);

    if (Number.isFinite(left))
        samples.push(left);

    if (Number.isFinite(right))
        samples.push(right);

    if (!samples.length) {

        return {
            mean: 128,
            contrast: 0
        };
    }

    const mean =
        samples.reduce(
            (a, b) => a + b,
            0
        ) /
        samples.length;

    return {

        mean,

        contrast:
            Math.abs(
                mean
            )
    };
}


/* =========================================================
   AVERAGE GRAY
========================================================= */

function averageGray(
    gray,
    x,
    y,
    w,
    h
) {

    const x0 =
        Math.max(
            0,
            Math.floor(x)
        );

    const y0 =
        Math.max(
            0,
            Math.floor(y)
        );

    const x1 =
        Math.min(
            analysisWidth,
            Math.ceil(
                x + w
            )
        );

    const y1 =
        Math.min(
            analysisHeight,
            Math.ceil(
                y + h
            )
        );

    if (
        x1 <= x0 ||
        y1 <= y0
    ) {

        return NaN;
    }

    let sum = 0;
    let count = 0;

    for (
        let yy = y0;
        yy < y1;
        yy += 2
    ) {

        for (
            let xx = x0;
            xx < x1;
            xx += 2
        ) {

            sum +=
                gray[
                    yy *
                    analysisWidth +
                    xx
                ];

            count++;
        }
    }

    return count
        ? sum / count
        : NaN;
}


/* =========================================================
   VARIANCE
========================================================= */

function calculateVariance(
    gray,
    region,
    mean
) {

    let sum = 0;
    let count = 0;

    const x0 =
        Math.max(
            0,
            Math.floor(region.x)
        );

    const y0 =
        Math.max(
            0,
            Math.floor(region.y)
        );

    const x1 =
        Math.min(
            analysisWidth,
            Math.ceil(
                region.x +
                region.width
            )
        );

    const y1 =
        Math.min(
            analysisHeight,
            Math.ceil(
                region.y +
                region.height
            )
        );

    for (
        let y = y0;
        y < y1;
        y += 3
    ) {

        for (
            let x = x0;
            x < x1;
            x += 3
        ) {

            const d =
                gray[
                    y *
                    analysisWidth +
                    x
                ] -
                mean;

            sum +=
                d * d;

            count++;
        }
    }

    return count
        ? sum / count
        : 0;
}


/* =========================================================
   COLORFULNESS
========================================================= */

function calculateColorfulness(
    imageData,
    region
) {

    const data =
        imageData.data;

    let total = 0;
    let count = 0;

    const x0 =
        Math.max(
            0,
            Math.floor(region.x)
        );

    const y0 =
        Math.max(
            0,
            Math.floor(region.y)
        );

    const x1 =
        Math.min(
            analysisWidth,
            Math.ceil(
                region.x +
                region.width
            )
        );

    const y1 =
        Math.min(
            analysisHeight,
            Math.ceil(
                region.y +
                region.height
            )
        );

    for (
        let y = y0;
        y < y1;
        y += 3
    ) {

        for (
            let x = x0;
            x < x1;
            x += 3
        ) {

            const p =
                (
                    y *
                    analysisWidth +
                    x
                ) * 4;

            const r =
                data[p];

            const g =
                data[p + 1];

            const b =
                data[p + 2];

            const max =
                Math.max(
                    r,
                    g,
                    b
                );

            const min =
                Math.min(
                    r,
                    g,
                    b
                );

            total +=
                max - min;

            count++;
        }
    }

    if (!count) {
        return 0;
    }

    return (
        total /
        count
    ) / 255;
}


/* =========================================================
   EDGE DISTRIBUTION
========================================================= */

function calculateEdgeDistribution(
    gradient,
    region
) {

    const values = [];

    const cols = 3;
    const rows = 3;

    for (
        let row = 0;
        row < rows;
        row++
    ) {

        for (
            let col = 0;
            col < cols;
            col++
        ) {

            const x =
                region.x +
                (
                    region.width /
                    cols
                ) * col;

            const y =
                region.y +
                (
                    region.height /
                    rows
                ) * row;

            const w =
                region.width /
                cols;

            const h =
                region.height /
                rows;

            let sum = 0;
            let count = 0;

            for (
                let yy =
                    Math.floor(y);

                yy <
                    Math.min(
                        analysisHeight,
                        Math.ceil(
                            y + h
                        )
                    );

                yy += 3
            ) {

                for (
                    let xx =
                        Math.floor(x);

                    xx <
                        Math.min(
                            analysisWidth,
                            Math.ceil(
                                x + w
                            )
                        );

                    xx += 3
                ) {

                    sum +=
                        gradient[
                            yy *
                            analysisWidth +
                            xx
                        ];

                    count++;
                }
            }

            values.push(
                count
                    ? sum / count
                    : 0
            );
        }
    }

    if (!values.length) {
        return 0;
    }

    const mean =
        values.reduce(
            (a, b) => a + b,
            0
        ) /
        values.length;

    if (mean <= 0) {
        return 0;
    }

    const variance =
        values.reduce(
            (sum, value) =>
                sum +
                Math.pow(
                    value - mean,
                    2
                ),
            0
        ) /
        values.length;

    /*
     * Lower variance = more evenly
     * distributed visual structure.
     */

    return 1 -
        Math.min(
            1,
            Math.sqrt(
                variance
            ) /
            Math.max(
                1,
                mean
            )
        );
}


/* =========================================================
   TEXT PENALTY
========================================================= */

function calculateTextPenalty(
    region,
    gradientMean,
    distribution
) {

    const aspect =
        region.width /
        Math.max(
            1,
            region.height
        );

    let penalty = 0;

    /*
     * Only penalize long regions when
     * they also have text-like structure.
     */

    if (
        aspect > 5 &&
        distribution > 0.35
    ) {

        penalty += 10;
    }

    if (
        aspect > 8
    ) {

        penalty += 15;
    }

    /*
     * Very thin regions are unlikely
     * to be standalone logos.
     */

    if (
        aspect > 12 ||
        aspect < 0.08
    ) {

        penalty += 20;
    }

    return penalty;
}


/* =========================================================
   UI PENALTY
========================================================= */

function calculateUIPenalty(
    region,
    gradientMean,
    distribution,
    border
) {

    let penalty = 0;

    const areaRatio =
        (
            region.width *
            region.height
        ) /
        (
            analysisWidth *
            analysisHeight
        );

    /*
     * Huge rectangular areas.
     */

    if (
        areaRatio > 0.22 &&
        distribution > 0.55
    ) {

        penalty += 15;
    }

    /*
     * Strong border + large area.
     */

    if (
        border.contrast > 35 &&
        areaRatio > 0.12
    ) {

        penalty += 10;
    }

    return penalty;
}


/* =========================================================
   PHOTO PENALTY
========================================================= */

function calculatePhotoPenalty(
    texture,
    gradientMean,
    colorfulness
) {

    let penalty = 0;

    if (
        texture > 65 &&
        gradientMean > 18
    ) {

        penalty += 12;
    }

    if (
        texture > 85 &&
        colorfulness > 0.25
    ) {

        penalty += 15;
    }

    return penalty;
}


/* =========================================================
   SCORE REGION
========================================================= */

function scoreRegion(
    e,
    region
) {

    let score = 0;

    /*
     * Visual structure.
     */

    score +=
        normalize(
            e.gradientMean,
            2,
            30
        ) * 25;

    /*
     * Background separation.
     */

    score +=
        normalize(
            e.separation,
            3,
            55
        ) * 22;

    /*
     * Edge distribution.
     */

    score +=
        e.edgeDistribution *
        15;

    /*
     * Color evidence.

     * Color is useful but not mandatory.
     */

    score +=
        normalize(
            e.colorfulness,
            0.02,
            0.35
        ) * 10;

    /*
     * Compactness.

     * Don't force logos to be square.
     */

    const aspect =
        region.width /
        Math.max(
            1,
            region.height
        );

    const compactness =
        Math.min(
            aspect,
            1 / aspect
        );

    score +=
        normalize(
            compactness,
            0.08,
            0.70
        ) * 10;

    /*
     * Penalize giant regions.
     */

    const areaRatio =
        (
            region.width *
            region.height
        ) /
        (
            analysisWidth *
            analysisHeight
        );

    if (
        areaRatio > 0.35
    ) {

        score -= 30;

    } else if (
        areaRatio > 0.25
    ) {

        score -= 18;

    } else if (
        areaRatio < 0.0005
    ) {

        score -= 12;
    }

    /*
     * Penalties.
     */

    score -=
        e.textPenalty;

    score -=
        e.uiPenalty;

    score -=
        e.photoPenalty;

    return Math.max(
        0,
        Math.min(
            100,
            score
        )
    );
}


/* =========================================================
   REFINEMENT
========================================================= */

function refineRegion(
    candidate,
    imageData,
    gray,
    gradient,
    integral,
    gradientIntegral
) {

    let best =
        candidate;

    const scales = [
        0.82,
        0.92,
        1.00,
        1.08,
        1.18
    ];

    const offsets = [
        [-0.15, -0.15],
        [0, -0.15],
        [0.15, -0.15],

        [-0.15, 0],
        [0, 0],
        [0.15, 0],

        [-0.15, 0.15],
        [0, 0.15],
        [0.15, 0.15]
    ];

    for (
        const scale
        of scales
    ) {

        for (
            const [ox, oy]
            of offsets
        ) {

            const w =
                candidate.width *
                scale;

            const h =
                candidate.height *
                scale;

            const cx =
                candidate.x +
                candidate.width / 2;

            const cy =
                candidate.y +
                candidate.height / 2;

            let x =
                cx -
                w / 2 +
                candidate.width *
                ox;

            let y =
                cy -
                h / 2 +
                candidate.height *
                oy;

            x =
                Math.max(
                    0,
                    Math.min(
                        analysisWidth - w,
                        x
                    )
                );

            y =
                Math.max(
                    0,
                    Math.min(
                        analysisHeight - h,
                        y
                    )
                );

            const test = {
                x,
                y,
                width: w,
                height: h
            };

            const evidence =
                evaluateRegion(
                    test,
                    imageData,
                    gray,
                    gradient,
                    integral,
                    gradientIntegral
                );

            const score =
                scoreRegion(
                    evidence,
                    test
                );

            if (
                score >
                best.score
            ) {

                best = {

                    ...test,

                    score,

                    evidence
                };
            }
        }
    }

    return best;
}


/* =========================================================
   NON MAXIMUM SUPPRESSION
========================================================= */

function nonMaximumSuppression(
    candidates
) {

    const sorted =
        [...candidates].sort(
            (a, b) =>
                b.score -
                a.score
        );

    const output = [];

    for (
        const candidate
        of sorted
    ) {

        let duplicate = false;

        for (
            const existing
            of output
        ) {

            if (
                calculateIoU(
                    candidate,
                    existing
                ) >
                NMS_IOU
            ) {

                duplicate = true;
                break;
            }
        }

        if (!duplicate) {

            output.push(
                candidate
            );
        }

        if (
            output.length >=
            MAX_RESULTS
        ) {

            break;
        }
    }

    return output;
}


/* =========================================================
   IOU
========================================================= */

function calculateIoU(
    a,
    b
) {

    const left =
        Math.max(
            a.x,
            b.x
        );

    const top =
        Math.max(
            a.y,
            b.y
        );

    const right =
        Math.min(
            a.x + a.width,
            b.x + b.width
        );

    const bottom =
        Math.min(
            a.y + a.height,
            b.y + b.height
        );

    const width =
        Math.max(
            0,
            right - left
        );

    const height =
        Math.max(
            0,
            bottom - top
        );

    const intersection =
        width *
        height;

    const union =
        (
            a.width *
            a.height
        ) +
        (
            b.width *
            b.height
        ) -
        intersection;

    return union > 0
        ? intersection / union
        : 0;
}


/* =========================================================
   DRAW CANDIDATES
========================================================= */

function drawCandidates(
    candidates
) {

    drawOriginal();

    const scaleX =
        canvas.width /
        analysisWidth;

    const scaleY =
        canvas.height /
        analysisHeight;

    candidates.forEach(
        (
            candidate,
            index
        ) => {

            const x =
                candidate.x *
                scaleX;

            const y =
                candidate.y *
                scaleY;

            const w =
                candidate.width *
                scaleX;

            const h =
                candidate.height *
                scaleY;

            ctx.save();

            ctx.fillStyle =
                "rgba(255,23,68,0.12)";

            ctx.strokeStyle =
                "#ff1744";

            ctx.lineWidth = 3;

            ctx.fillRect(
                x,
                y,
                w,
                h
            );

            ctx.strokeRect(
                x,
                y,
                w,
                h
            );

            const badge = 26;

            ctx.fillStyle =
                "#ff1744";

            ctx.fillRect(
                x,
                Math.max(
                    0,
                    y - badge
                ),
                badge,
                badge
            );

            ctx.fillStyle =
                "#ffffff";

            ctx.font =
                "bold 14px Arial";

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "middle";

            ctx.fillText(
                String(index + 1),
                x + badge / 2,
                Math.max(
                    badge / 2,
                    y - badge / 2
                )
            );

            ctx.restore();
        }
    );
}


/* =========================================================
   RESULTS
========================================================= */

function renderResults(
    candidates
) {

    resultsEl.innerHTML = "";

    resultCountEl.textContent =
        `${candidates.length} candidates`;

    resultsSection.classList.remove(
        "hidden"
    );

    if (!candidates.length) {

        resultsEl.innerHTML = `
            <div style="
                padding:30px;
                text-align:center;
                color:#777;
            ">
                No strong visual candidate
                was detected.
            </div>
        `;

        return;
    }

    candidates.forEach(
        (
            candidate,
            index
        ) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "result";

            const e =
                candidate.evidence;

            item.innerHTML = `

                <div class="number">
                    ${index + 1}
                </div>

                <div>

                    <div class="result-title">
                        Visual Candidate ${index + 1}
                    </div>

                    <div class="result-meta">

                        Position:
                        ${Math.round(candidate.x)},
                        ${Math.round(candidate.y)}

                        <br>

                        Size:
                        ${Math.round(candidate.width)}
                        ×
                        ${Math.round(candidate.height)}

                        <br>

                        Structure:
                        ${Math.round(
                            e.gradientMean
                        )}

                        &nbsp; | &nbsp;

                        Separation:
                        ${Math.round(
                            e.separation
                        )}

                        &nbsp; | &nbsp;

                        Color:
                        ${Math.round(
                            e.colorfulness * 100
                        )}%

                    </div>

                </div>

                <div class="score">

                    ${Math.round(
                        candidate.score
                    )}

                    <small>
                        score
                    </small>

                </div>
            `;

            item.addEventListener(
                "click",
                function () {

                    highlightCandidate(
                        candidate
                    );
                }
            );

            resultsEl.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   HIGHLIGHT
========================================================= */

function highlightCandidate(
    candidate
) {

    drawOriginal();

    const scaleX =
        canvas.width /
        analysisWidth;

    const scaleY =
        canvas.height /
        analysisHeight;

    const x =
        candidate.x *
        scaleX;

    const y =
        candidate.y *
        scaleY;

    const w =
        candidate.width *
        scaleX;

    const h =
        candidate.height *
        scaleY;

    ctx.save();

    ctx.fillStyle =
        "rgba(255,23,68,0.18)";

    ctx.strokeStyle =
        "#ff1744";

    ctx.lineWidth = 5;

    ctx.fillRect(
        x,
        y,
        w,
        h
    );

    ctx.strokeRect(
        x,
        y,
        w,
        h
    );

    ctx.restore();
}


/* =========================================================
   NORMALIZE
========================================================= */

function normalize(
    value,
    min,
    max
) {

    if (
        value <= min
    ) {
        return 0;
    }

    if (
        value >= max
    ) {
        return 1;
    }

    return (
        value - min
    ) /
    (
        max - min
    );
}


/* =========================================================
   YIELD
========================================================= */

function browserYield() {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                0
            )
    );
}


/* =========================================================
   CLEAR
========================================================= */

clearBtn.addEventListener(
    "click",
    function () {

        /*
         * IMPORTANT:
         *
         * Your previous code had:
         *
         * image = null;
         *
         * Because "use strict" is enabled,
         * that throws:
         *
         * ReferenceError: image is not defined
         *
         * There is no reason to use it.
         */

        sourceImage = null;

        sourceWidth = 0;

        sourceHeight = 0;

        analysisCanvas = null;

        analysisCtx = null;

        analysisWidth = 0;

        analysisHeight = 0;

        window.logoCandidates = [];

        imageInput.value = "";

        analyzeBtn.disabled =
            true;

        resultsSection.classList.add(
            "hidden"
        );

        previewSection.classList.add(
            "hidden"
        );

        progressBox.classList.add(
            "hidden"
        );

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        resultsEl.innerHTML = "";

        dimensionsEl.textContent =
            "";

        resultCountEl.textContent =
            "";

        setStatus(
            "Ready"
        );
    }
);


/* =========================================================
   STARTUP
========================================================= */

console.log(
    "Sprint 14.2 Generic Visual Region Detector loaded."
);