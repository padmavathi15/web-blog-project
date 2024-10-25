const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs'); 
const path = require('path'); 
const multer = require('multer');   
const session = require('express-session');
const crypto = require('crypto');
const router = express.Router();


const app = express(); 

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'defaultFallbackSecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname); 
    }
});

const upload = multer({ storage: storage }); 

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));

// Set EJS as the templating engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public'))); 

// File paths for users and posts
const usersFilePath = path.join(__dirname, 'users.json');
const postsFilePath = path.join(__dirname, 'posts.json');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Load users from JSON
function loadUsers() {
    if (!fs.existsSync(usersFilePath)) return [];
    return JSON.parse(fs.readFileSync(usersFilePath, 'utf-8'));
}

// Check if username is taken 
app.get('/check-username', (req, res) => {
    const username = req.query.username.toLowerCase();

    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user file:', err);
            return res.status(500).send({ available: false, error: 'Error checking username' });
        }

        const users = JSON.parse(data);
        const usernameExists = users.some(user => user.username.toLowerCase() === username);

        res.send({ available: !usernameExists });
    });
});

// Routes
app.get("/",(req,res)=>{
    res.render('register', { errorMessage: null,successMessage:null });
});
// Handle user registration
app.post('/register', (req, res) => {
    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading user data.');
        }

        let users = [];
        try {
            users = JSON.parse(data);
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            return res.status(500).send('Error processing user data.');
        }

        const emailExists = users.some(user => user.email === req.body.email);
        const phoneExists = users.some(user => user.phone === req.body.phone);
        const usernameExists = users.some(user => user.username === req.body.username);

        let errorMessage = null;
        let successMessage = null;

        // Check for existing email, phone, and username
        if (emailExists && phoneExists) {
            errorMessage = 'Email and Phone number already exist. Please use different ones.';
        } else if (emailExists) {
            errorMessage = 'Email already exists. Please use a different one.';
        } else if (phoneExists) {
            errorMessage = 'Phone number already exists. Please use a different one.';
        } else if (usernameExists) {
            errorMessage = 'Username already exists. Please choose a different username.';
        }

        // Check for password match
        if (req.body.password !== req.body.cpassword) {
            errorMessage = 'Passwords do not match. Please try again.';
        }

        // If there's an error, render the page with errorMessage
        if (errorMessage) {
            return res.render('register', { errorMessage, successMessage: null });
        }

        // Create a new user object
        const newUser = {
            username: req.body.username,
            email: req.body.email,
            phone: req.body.phone,
            password: req.body.password,
            gender: req.body.gender,
            dob: req.body.dob,
            city: req.body.city,
            country: req.body.country,
            state: req.body.state,
            countryCode: req.body.countryCode
        };

        users.push(newUser);

        // Log the users array before writing to file
        console.log('Users array before writing to file:', users);

        fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error writing file:', err);
                return res.status(500).send('Error saving user data.');
            }

            successMessage = 'Registration successful!';
            return res.render('register', { errorMessage: null, successMessage });
        });
    });
});




// Login page
app.get('/login', (req, res) => {
    res.render('login', { errorMessage: null });
});

// Handle user login
app.post('/login', (req, res) => {
    const { emailOrPhone, password } = req.body;

    fs.readFile(usersFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading user data.');
        }

        let users = JSON.parse(data);
        const user = users.find(u => (u.email === emailOrPhone || u.phone === emailOrPhone) && u.password === password);

        if (user) {
            req.session.user = user;

            // Now fetch posts to pass to home
            fs.readFile(postsFilePath, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading posts file:', err);
                    return res.status(500).send('Error fetching posts.');
                }

                const posts = data ? JSON.parse(data) : [];
                res.render('home', { user, posts });            });
        } else {
            res.render('login', { errorMessage: 'Invalid credentials. Please try again.' });
        }
    });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); 
    }

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading posts file:', err);
            return res.status(500).send('Error fetching posts.');
        }

        const posts = data ? JSON.parse(data) : [];
        res.render('dashboard', { user: req.session.user, posts });
    });
});

// Home route
app.get('/home', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading posts:', err);
            return res.status(500).send('Error loading posts.');
        }

        const posts = JSON.parse(data);
        res.render('home', { user: req.session.user, posts });
    });
}); 
  
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); 
    }

    // Read the posts data
    fs.readFile(postsFilePath, 'utf8', (err, postsData) => {
        if (err) {
            console.error('Error reading posts:', err);
            return res.status(500).send('Error loading posts.');
        }

        const posts = JSON.parse(postsData);
        const userPosts = posts.filter(post => post.author === req.session.user.email || post.author === req.session.user.phone);

        // Read the shared posts data
        fs.readFile(path.join(__dirname, 'shareposts.json'), 'utf8', (err, sharedData) => {
            if (err) {
                console.error('Error reading shared posts:', err);
                return res.status(500).send('Error loading shared posts.');
            }

            const allSharedPosts = JSON.parse(sharedData);
            // Filter shared posts only by the logged-in user
            const userSharedPosts = allSharedPosts.filter(sharedPost => {
                return sharedPost.sharedBy === req.session.user.email || sharedPost.sharedBy === req.session.user.phone;
            });

            // Map shared posts to include original post details
            const sharedPosts = userSharedPosts.map(sharedPost => {
                const originalPost = posts.find(post => post.id === parseInt(sharedPost.postId));

                return {
                    ...sharedPost,
                    originalTitle: originalPost ? originalPost.title : 'Post Not Found',
                    originalContent: originalPost ? originalPost.content : 'Content not available',
                    originalAttachment: originalPost ? originalPost.attachment : null
                };
            });

            // Log sharedPosts to verify data
            console.log("Shared Posts by User:", sharedPosts);

            res.render('profile', { user: req.session.user, posts: userPosts, sharedPosts });
        });
    });
});
app.post('/upload-profile-pic', upload.single('profilePic'), (req, res) => {
    if (req.file) {
        const profilePicPath = `/uploads/${req.file.filename}`; // Adjust the path as needed
        res.json({ success: true, profilePicPath });
    } else {
        res.json({ success: false, message: 'No file uploaded' });
    }
});
app.post('/share-post/:postId', (req, res) => {
    const postId = req.params.postId;
    const { title, content } = req.body;
    const sharedBy = req.session.user.email || req.session.user.phone; // Adjusted line
    
    fs.readFile(path.join(__dirname, 'posts.json'), 'utf8', (err, postsData) => {
        if (err) {
            console.error('Error reading posts:', err);
            return res.status(500).json({ success: false, message: 'Error reading posts.' });
        }

        const posts = postsData ? JSON.parse(postsData) : [];
        const originalPost = posts.find(post => post.id === parseInt(postId));

        if (!originalPost) {
            return res.status(404).json({ success: false, message: 'Original post not found.' });
        }

        const originalAuthor = originalPost.author;
        const originalAuthor1 = originalPost.author1;
        const sharedByUser = req.session.user.username; 

        fs.readFile(path.join(__dirname, 'shareposts.json'), 'utf8', (err, sharedData) => {
            if (err) {
                console.error('Error reading shared posts:', err);
                return res.status(500).json({ success: false, message: 'Error reading shared posts.' });
            }

            const allSharedPosts = sharedData ? JSON.parse(sharedData) : [];

            const newSharedPost = {
                id: Date.now(),
                title,
                content,
                sharedBy,
                postId,
                originalAuthor,
                originalAuthor1,
                sharedByUser,
                timestamp: new Date().toISOString()
            };

            allSharedPosts.push(newSharedPost);

            fs.writeFile(path.join(__dirname, 'shareposts.json'), JSON.stringify(allSharedPosts, null, 2), (err) => {
                if (err) {
                    console.error('Error saving shared post:', err);
                    return res.status(500).json({ success: false, message: 'Error saving shared post.' });
                }

                res.json({ success: true, message: 'Post shared successfully!' });
            });
        });
    });
});

// Route for adding a post
app.post('/add-post', upload.single('attachment'), (req, res) => {
    const { title, content } = req.body;
    const attachment = req.file ? req.file.filename : null;
    const userIdentifier = req.session.user.email || req.session.user.phone;
    const userIdentifier1 = req.session.user.username; 

    const timestamp = new Date().toLocaleString();
    const newPost = {
        id: Date.now(),
        title,
        content,
        attachment,
        author: userIdentifier,
        author1: userIdentifier1,
        timestamp
    };

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Error reading posts file:', err);
            return res.status(500).send('Error reading posts.');
        }

        const posts = data ? JSON.parse(data) : [];
        posts.push(newPost);

        fs.writeFile(postsFilePath, JSON.stringify(posts, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error writing posts file:', err);
                return res.status(500).send('Error saving post.');
            }
            res.redirect('/home'); 
        });
    });
});

// Edit Post Route
app.post('/edit-post/:id', (req, res) => {
    const postId = req.params.id;
    const { title, content } = req.body;

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error reading posts.' });
        }

        const posts = JSON.parse(data);
        const post = posts.find(p => p.id == postId);

        if (post) {
            post.title = title;
            post.content = content;

            fs.writeFile(postsFilePath, JSON.stringify(posts, null, 2), (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Error saving post.' });
                }
                res.json({ success: true });
            });
        } else {
            res.status(404).json({ success: false, message: 'Post not found.' });
        }
    });
});

// Delete Post Route
app.delete('/delete-post/:id', (req, res) => {
    const postId = req.params.id;

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error reading posts.' });
        }

        let posts = JSON.parse(data);
        posts = posts.filter(p => p.id != postId); // Filter out the post to be deleted

        fs.writeFile(postsFilePath, JSON.stringify(posts, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error saving posts.' });
            }
            res.json({ success: true });
        });
    });
});



// Route to handle search
app.get('/search', (req, res) => {
    const username = req.query.username;
    console.log('Searching for username:', username);

    fs.readFile(postsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading posts:', err);
            return res.status(500).send('Error loading posts.');
        }

        const posts = JSON.parse(data);
        console.log('All posts:', posts); // Log all posts

        const userPosts = posts.filter(post => {
            console.log(`Comparing: '${post.author1}' with '${username}'`);
            const matches = post.author1.toLowerCase() === username.toLowerCase();
            console.log(`Result: ${matches}`);
            return matches;
        });

        console.log('Filtered posts:', userPosts); // Log filtered posts

        if (userPosts.length === 0) {
            return res.send(`No posts found for this username.`);
        }

        res.render('search-results', { user: req.session.user, posts: userPosts, username });
    });
});


// Logout route
app.post('/logout', (req, res) => {
    // Assuming you're using express-session
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/login'); // Redirect to the login page after logout
    });
});
app.get('/logout', (req, res) => {
    // Assuming you're using express-session
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/login'); // Redirect to the login page after logout
    });
});


    

// Server setup
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
