function isValidJWT(token) {
    return token && typeof token === 'string' && token.split('.').length === 3;
}

function getUserIdFromToken(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload && payload.sub) {
            return parseInt(payload.sub, 10);
        }
        throw new Error('User ID not found in token');
    } catch (error) {
        console.error('Error parsing token:', error);
        throw new Error('Invalid token structure');
    }
}

async function fetchUserData() {
    const token = localStorage.getItem('jwtToken');
    if (!isValidJWT(token)) {
        localStorage.removeItem('jwtToken');
        showLoginView();
        return;
    }

    let userId;
    try {
        userId = getUserIdFromToken(token);
    } catch (error) {
        console.error('Error getting user ID:', error);
        showLoginView();
        return;
    }

    const eventId = 20; // You might want to make this dynamic if needed

    const query = `
    query($userId: Int!, $eventId: Int!) {
        user(where: {id: {_eq: $userId}}) {
            id
            login
            email
            totalUp
            totalDown
            auditRatio
            transactions(where: {type: {_eq: "xp"}}, order_by: {createdAt: desc}, limit: 10) {
                amount
                createdAt
                path
            }
            skills: transactions(
                order_by: [{type: desc}, {amount: desc}]
                distinct_on: [type]
                where: {type: {_in: ["skill_js", "skill_go", "skill_html", "skill_prog", "skill_front-end", "skill_back-end"]}}
            ) {
                type
                amount
            }
        }
        event_user(where: { userId: { _eq: $userId }, eventId: {_eq: $eventId}}) {
            level
        }
    }
    `;

    try {
        const response = await fetch('https://learn.reboot01.com/api/graphql-engine/v1/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                query: query,
                variables: { userId: userId, eventId: eventId }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
        console.log("Raw API response:", data);

        if (data.errors) {
            console.error("GraphQL Errors:", data.errors);
            throw new Error('GraphQL query failed');
        }

        if (!data.data || !data.data.user || data.data.user.length === 0) {
            throw new Error('No user data found');
        }

        displayUserData(data.data);
    } catch (error) {
        console.error('Error:', error);
        showLoginView();
    }
}

function displayUserData(data) {
    console.log("Displaying user data:", data);

    const user = data.user[0];
    const level = data.event_user[0]?.level || 'N/A';

    document.getElementById('user-name').textContent = user.login;
    // document.getElementById('user-icon').src = `https://avatars.githubusercontent.com/${user.login}`;

    // Update user info section
    document.getElementById('user-level').textContent = level;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-id').textContent = user.id;
    document.getElementById('user-audit-ratio').textContent = user.auditRatio.toFixed(1);

    // Keep the existing functionality
    updateAuditRatio(user.totalUp, user.totalDown, user.auditRatio);
    displayTransactionHistory(user.transactions);
    createAuditChart(user.totalUp, user.totalDown);
    displayUserSkills(user.skills);
}   

function updateAuditRatio(totalUp, totalDown, auditRatio) {
    const doneBar = document.getElementById('done-bar');
    const receivedBar = document.getElementById('received-bar');
    const doneValue = document.getElementById('done-value');
    const receivedValue = document.getElementById('received-value');
    const ratioValue = document.getElementById('audit-ratio-value');
    const ratioMessage = document.getElementById('audit-message');

    const maxValue = Math.max(totalUp, totalDown);
    
    doneBar.style.width = `${(totalUp / maxValue) * 100}%`;
    receivedBar.style.width = `${(totalDown / maxValue) * 100}%`;
    
    const totalUpMB = (totalUp / (1024 * 1024)).toFixed(2);
    const totalDownMB = (totalDown / (1024 * 1024)).toFixed(2);
    
    doneValue.textContent = `${totalUpMB} MB`;
    receivedValue.textContent = `${totalDownMB} MB`;
    
    ratioValue.textContent = auditRatio.toFixed(1);
    
    if (auditRatio < 1) {
        ratioMessage.textContent = "MAKE MORE AUDITS!";
    } else if (auditRatio === 1) {
        ratioMessage.textContent = "WELL BALANCED!";
    } else {
        ratioMessage.textContent = "GREAT JOB!";
    }

    // Update SVG chart
    createAuditChart(totalUp, totalDown);
}

function createAuditChart(totalUp, totalDown) {
    const width = 300;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    d3.select("#audit-chart").selectAll("*").remove();

    const svg = d3.select("#audit-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .range([0, width - margin.left - margin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .range([height - margin.top - margin.bottom, 0]);

    const data = [
        { label: "Done", value: totalUp / 1000 },
        { label: "Received", value: totalDown / 1000 }
    ];

    x.domain(data.map(d => d.label));
    y.domain([0, Math.max(totalUp, totalDown) / 1000]);

    svg.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.label))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => height - margin.top - margin.bottom - y(d.value))
        .attr("fill", (d, i) => i === 0 ? "#4CAF50" : "#2196F3");

    svg.append("g")
        .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .style("fill", "white");

    svg.append("g")
        .call(d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => d3.format(",.0f")(d)))
        .selectAll("text")
        .style("fill", "white");

    svg.selectAll(".domain, .tick line")
        .style("stroke", "white");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("fill", "white")
        .text("kB");
}

function displayTransactionHistory(transactions) {
    const transactionList = document.getElementById('transaction-list');
    transactionList.innerHTML = '';

    transactions.forEach(transaction => {
        const transactionItem = document.createElement('div');
        transactionItem.className = 'transaction-item';

        const projectName = transaction.path.split('/').pop().replace(/-/g, ' ');
        const amount = (transaction.amount / 1000).toFixed(1);
        const date = new Date(transaction.createdAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });

        transactionItem.innerHTML = `
            <div class="transaction-project">Project — ${projectName}</div>
            <div class="transaction-amount">${amount} kB</div>
            <div class="transaction-date">${date}</div>
        `;

        transactionList.appendChild(transactionItem);
    });
}

function createAuditChart(totalUp, totalDown) {
    console.log("Creating audit chart with:", { totalUp, totalDown });

    // Convert bytes to kilobytes
    const totalUpKB = totalUp / 1000;
    const totalDownKB = totalDown / 1000;

    const width = 300;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 60 };

    d3.select("#audit-chart").selectAll("*").remove();

    const svg = d3.select("#audit-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .range([0, width - margin.left - margin.right])
        .padding(0.1);

    const y = d3.scaleLinear()
        .range([height - margin.top - margin.bottom, 0]);

    const data = [
        { label: "Done", value: totalUpKB },
        { label: "Received", value: totalDownKB }
    ];

    x.domain(data.map(d => d.label));
    y.domain([0, Math.max(totalUpKB, totalDownKB)]);

    console.log("Y domain (kB):", y.domain());

    svg.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.label))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => height - margin.top - margin.bottom - y(d.value))
        .attr("fill", (d, i) => i === 0 ? "#4CAF50" : "#2196F3");

    svg.append("g")
        .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .call(d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => d3.format(",.0f")(d))); // Format as integer

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("kB");
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function displayUserSkills(skills) {
    // Transform and clean up skill types
    const skillsData = skills.map(item => ({
        type: item.type.split('_')[1].charAt(0).toUpperCase() + item.type.split('_')[1].slice(1),
        amount: item.amount
    }));

    // Prepare data for Google Charts
    const data = new google.visualization.DataTable();
    data.addColumn('string', 'Skill Type');
    data.addColumn('number', 'Amount');
    skillsData.forEach(item => {
        data.addRow([item.type, item.amount]);
    });

    // Set chart options
    const options = {
        title: 'User Skills Distribution',
        titleTextStyle: { 
            color: '#1D1D1F',
            fontSize: 18,
            fontName: 'SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen-Sans, Ubuntu, Cantarell, Helvetica Neue, sans-serif',
            bold: true
        },
        pieHole: 0.4,
        colors: ['#007AFF', '#5AC8FA', '#FF9F40', '#FF3B30', '#5856D6', '#34C759'],
        backgroundColor: '#FFFFFF',
        legend: { 
            position: 'right',
            textStyle: { 
                color: '#1D1D1F',
                fontName: 'SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen-Sans, Ubuntu, Cantarell, Helvetica Neue, sans-serif',
            }
        },
        chartArea: { width: '80%', height: '80%' },
        pieSliceTextStyle: { 
            color: '#FFFFFF',
            fontName: 'SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen-Sans, Ubuntu, Cantarell, Helvetica Neue, sans-serif',
        },
        pieSliceText: 'value',
        tooltip: { 
            trigger: 'none'  // This disables the hover tooltip
        }
    };

    // Initialize and render the donut chart
    const chart = new google.visualization.PieChart(document.getElementById('skillPolarChart'));
    chart.draw(data, options);

    // Add responsiveness
    window.addEventListener('resize', () => {
        chart.draw(data, options);
    });
}
// Load Google Charts library
google.charts.load('current', { 'packages': ['corechart'] });
google.charts.setOnLoadCallback(fetchUserData);

function showLoginView() {
    console.log("Showing login view");
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('profile-view').style.display = 'none';
}

function showProfileView() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('profile-view').style.display = 'block';
    fetchUserData();
}