

Thoughts on fifo

Support 2 modes

1. Ring all
2. enterprise

# Ring all

When a call comes in - ring all available phones

When an agent hangs up the queue position number 1 is assigned to that phone
If further agents hang up then they are also added to that potential call

We can extend the ring time and repeat

When a call is answered:

1. if other calls waiting update all existing calls
2. if no other calls in queue waiting hangup ringing phones

# Enterprise

When 1 call comes in - ring 1 phone
When 2 calls come in ring 2 phones
Hide caller id during ringing to be able to place next call placed on first answer

Support idle time after agent finishes

# Common

A queue with the same name for enterprise and ring all are 2 separate queues
A queue will have a priority (and a default priority)
In these 2 scenarios both queues 
