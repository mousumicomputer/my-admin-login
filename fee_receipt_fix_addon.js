/**
 * Mousumi Computer ERP - Fee Receipt Number Dynamic Sync Addon
 * File: fee_receipt_fix_addon.js
 * 
 * Purpose:
 * - মূল fee_collection_module ফাইলে হাত না দিয়ে রিসিট নম্বর সিঙ্ক করা।
 * - ডাটাবেজের সর্বোচ্চ রিসিট নম্বর (Max Existing Receipt No) যাচাই করে পরবর্তী ক্রম নির্ধারণ করা।
 * - ফর্ম সাবমিট করার সাথে সাথেই রিসিটে এবং ডাটাবেজে সঠিক রিসিট নম্বর (যেমন: ৩৬০৪) প্রদান করা।
 */

(function () {
    let fbCore = null;

    // Firebase কানেক্টর
    async function getFirebaseInstance() {
        if (fbCore) return fbCore;
        try {
            const fbApp = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
            const fbDb = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");

            let app;
            for (let i = 0; i < 20; i++) {
                try { 
                    app = fbApp.getApp(); 
                    if (app) break; 
                } catch (e) {}
                await new Promise(r => setTimeout(r, 150));
            }
            if (!app) {
                app = fbApp.initializeApp({
                    databaseURL: "https://mousumi-computer-default-rtdb.firebaseio.com",
                    projectId: "mousumi-computer"
                }, "feeFixApp_" + Date.now());
            }

            const db = fbDb.getDatabase(app);
            fbCore = { db, ref: fbDb.ref, set: fbDb.set, get: fbDb.get };
            return fbCore;
        } catch (err) {
            console.error("Addon Firebase Connection Error:", err);
            return null;
        }
    }

    // তারিখ ফরম্যাট হেল্পার (DD-MM-YYYY)
    function formatDateToDDMMYYYY(dateStr) {
        if (!dateStr) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;
    }

    // ডাটাবেজের সমস্ত ট্রানজেকশন স্ক্যান করে পরবর্তী আসল রিসিট নম্বর বের করার ফাংশন
    async function calculateAccurateNextReceiptNo(fb) {
        try {
            const txSnap = await fb.get(fb.ref(fb.db, 'erp/feeTransactions'));
            const txs = txSnap.val() ? (Array.isArray(txSnap.val()) ? txSnap.val() : Object.values(txSnap.val())) : [];

            const voidSnap = await fb.get(fb.ref(fb.db, 'erp/feeVoidLogs'));
            const voidTxs = voidSnap.val() ? (Array.isArray(voidSnap.val()) ? voidSnap.val() : Object.values(voidSnap.val())) : [];

            let maxReceiptNo = 3400; // বেস নম্বর

            // পেন্ডিং, পেইড ও ভয়েড সব ট্রানজেকশনের সর্বোচ্চ নম্বরটি খোঁজা
            [...txs, ...voidTxs].forEach(item => {
                if (item && item.receiptNo) {
                    const cleanNum = parseInt(String(item.receiptNo).replace(/\D/g, ''), 10);
                    if (!isNaN(cleanNum) && cleanNum > maxReceiptNo) {
                        maxReceiptNo = cleanNum;
                    }
                }
            });

            // সর্বোচ্চ নম্বরের সাথে ১ যোগ করে আসল পরবর্তী নম্বর নির্ধারণ
            return maxReceiptNo + 1;
        } catch (e) {
            console.error("Error calculating next receipt no:", e);
            return 3604; // ফেইলব্যাক
        }
    }

    // মূল ফর্ম সাবমিশন স্মার্ট প্যাচ (Override)
    function attachReceiptFixPatch() {
        const origForm = document.getElementById('feeFormOriginal');
        if (!origForm) return;

        // পূর্ববর্তী সাবমিট হ্যান্ডলার পরিবর্তন করে ডায়নামিক হ্যান্ডলার সংযুক্ত করা
        origForm.onsubmit = async function (e) {
            e.preventDefault();
            e.stopImmediatePropagation(); // আগের ত্রুটিপূর্ণ হ্যান্ডলার থামিয়ে দেওয়া

            const idInp = document.getElementById('origId');
            const nameInp = document.getElementById('origName');
            const dateInp = document.getElementById('origDate');
            const dueInp = document.getElementById('origDue');
            const txnInp = document.getElementById('origTxn');
            const chargeSpan = document.getElementById('origCharge');
            const recInp = document.getElementById('origRec');
            const discInp = document.getElementById('origDisc');
            const alertBox = document.getElementById('adjustmentAlertBox');

            const studentId = idInp ? idInp.value.trim() : '';
            const studentName = nameInp ? nameInp.value.trim() : '';
            const netDue = parseFloat(dueInp ? dueInp.value : 0) || 0;
            const txnFee = parseFloat(txnInp ? txnInp.value : 0) || 0;
            const totalCharge = parseFloat(chargeSpan ? chargeSpan.innerText : 0) || 0;
            const netReceived = parseFloat(recInp ? recInp.value : 0) || 0;
            const discount = parseFloat(discInp ? discInp.value : 0) || 0;

            if (!studentId || netReceived <= 0) {
                alert("Please enter valid student ID and amount!");
                return;
            }

            if (typeof showLoader === 'function') showLoader("Generating verified receipt...");

            try {
                const fb = await getFirebaseInstance();
                if (!fb) throw new Error("Firebase unavailable");

                // ১. একদম নির্ভুল পরবর্তী রিসিট নম্বর হিসাব করা (যেমন: ৩৬০৩ থাকলে ৩৬০৪)
                const verifiedReceiptNo = await calculateAccurateNextReceiptNo(fb);

                // ২. শিক্ষার্থীর মাস্টার তথ্য আনা (ক্লাস, সেকশন ইত্যাদির জন্য)
                const studentSnap = await fb.get(fb.ref(fb.db, 'erp/studentDueData'));
                const studentList = studentSnap.val() ? (Array.isArray(studentSnap.val()) ? studentSnap.val() : Object.values(studentSnap.val())) : [];
                const sData = studentList.find(s => 
                    String(s.stdId).trim() === studentId || 
                    String(s.mobile).trim() === studentId ||
                    String(s.fathersMobile).trim() === studentId ||
                    String(s.mothersMobile).trim() === studentId
                );

                const percentCapCharge = Math.min(netDue * 0.01, 60);
                const calculatedGross = netDue + percentCapCharge;
                const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const chosenDate = dateInp && dateInp.value ? dateInp.value : new Date().toISOString().split('T')[0];
                const collectorName = (window.profileSettings && window.profileSettings.fullName) || 'Riyal Robiul';

                // ৩. সম্পূর্ণ নির্ভুল ট্রানজেকশন অবজেক্ট তৈরি
                const newTransaction = {
                    id: 'EDU-' + Date.now(),
                    receiptNo: String(verifiedReceiptNo), // এখানে আসল ক্রমিক নম্বর বসবে
                    customerId: studentId,
                    studentName: studentName || (sData ? sData.studentName : '-'),
                    class: sData ? (sData.class || '-') : '-',
                    section: sData ? (sData.section || '-') : '-',
                    month: sData ? (sData.monthDue || '-') : '-',
                    category: sData ? (sData.category || '-') : '-',
                    dueItems: sData ? (sData.dueItems || '-') : '-',
                    mobile: sData ? (sData.mobile || '-') : '-',
                    netDue: netDue,
                    txnFee: txnFee,
                    totalCharge: totalCharge,
                    discount: discount,
                    netReceived: netReceived,
                    grossPayment: calculatedGross,
                    date: chosenDate,
                    time: nowTime,
                    status: 'Pending',
                    receivedBy: collectorName
                };

                // ৪. ডাটাবেজে রেকর্ড সেভ করা
                const txSnap = await fb.get(fb.ref(fb.db, 'erp/feeTransactions'));
                let currentTxList = txSnap.val() ? (Array.isArray(txSnap.val()) ? txSnap.val() : Object.values(txSnap.val())) : [];
                currentTxList.unshift(newTransaction);
                await fb.set(fb.ref(fb.db, 'erp/feeTransactions'), currentTxList);

                if (typeof showToast === 'function') {
                    showToast(`Fee recorded successfully! (Receipt #${verifiedReceiptNo})`, "success");
                }

                // ৫. তাৎক্ষণিক রিসিট ওপেন করা (যাতে ঠিক ৩৬০৪ প্রিন্ট হয়)
                const receiptPayload = {
                    receiptNo: newTransaction.receiptNo,
                    date: formatDateToDDMMYYYY(newTransaction.date),
                    studentName: newTransaction.studentName,
                    studentId: newTransaction.customerId,
                    tuitionFee: netDue.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    charge: totalCharge.toFixed(1),
                    total: netReceived.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    received: netReceived.toString(),
                    receivedBy: newTransaction.receivedBy
                };

                if (typeof window.openReceiptInNewTab === 'function') {
                    window.openReceiptInNewTab(receiptPayload);
                }

                // ৬. ফরম রিসেট
                origForm.reset();
                if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];
                if (txnInp) txnInp.value = "6.00";
                if (alertBox) alertBox.style.display = 'none';

                // রি-ক্যালকুলেট ট্রিগার
                if (discInp) discInp.dispatchEvent(new Event('input'));

            } catch (err) {
                console.error("Addon submission error:", err);
                if (typeof showToast === 'function') showToast("Error saving: " + err.message, "error");
            } finally {
                if (typeof hideLoader === 'function') hideLoader();
            }
        };
    }

    // মূল মডিউল লোড হওয়া শেষ হলে স্বয়ংক্রিয়ভাবে প্যাচ সংযুক্ত হবে
    window.addEventListener('load', () => {
        setTimeout(attachReceiptFixPatch, 300);
    });
})();
